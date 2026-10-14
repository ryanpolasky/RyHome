import { randomBytes } from "node:crypto";
import { AccessoryStore, cleanOverride } from "./accessories.js";
import { GROUP_PREFIX, GroupStore } from "./groups.js";
import { buildHome } from "./home.js";
import { ApiError, startHttp, type Route } from "./http.js";
import { MatterHub } from "./matter.js";
import { cleanLightPatch, SceneStore } from "./scenes.js";
import type { Accessory, Capabilities, Home, LightState } from "./types.js";

const CHANGE_DEBOUNCE_MS = 50;

const token = process.env.RYHOME_TOKEN ?? randomBytes(32).toString("base64url");
const port = Number(process.env.RYHOME_PORT ?? 8788);
const host = process.env.RYHOME_HOST ?? "127.0.0.1";

let last: Home | null = null;
let changeTimer: NodeJS.Timeout | null = null;

const scenes = new SceneStore();
const store = new AccessoryStore();
const groups = new GroupStore();
const matter = new MatterHub(() => scheduleChange());
const home = () => buildHome(matter, scenes, store, groups);
const lightIds = () => new Set(matter.lights().map((l) => l.id));

// groups fan out to their members; one unreachable bulb shouldn't stop the rest
async function setLight(id: string, patch: Partial<LightState>) {
  const group = groups.get(id);
  if (!group) return matter.setLight(id, patch);
  const reachable = new Set(matter.lights().filter((l) => l.reachable).map((l) => l.id));
  const results = await Promise.allSettled(group.members.filter((m) => reachable.has(m)).map((m) => matter.setLight(m, patch)));
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed.length > 0 && failed.length === results.length) throw failed[0].reason;
}

const shape = (h: Home) =>
  JSON.stringify([h.name, h.temperatureUnit, h.colorPresets, h.rooms, h.scenes, h.accessories.map((a) => [a.id, a.name, a.roomId])]);

function scheduleChange() {
  if (changeTimer) return;
  changeTimer = setTimeout(() => {
    changeTimer = null;
    const next = home();
    const previous = last;
    last = next;
    if (!previous) return;
    if (shape(previous) !== shape(next)) {
      http.broadcast({ type: "homeChanged" });
      return;
    }
    const before = new Map(previous.accessories.map((a) => [a.id, JSON.stringify(a)]));
    for (const accessory of next.accessories) {
      if (before.get(accessory.id) !== JSON.stringify(accessory)) http.broadcast({ type: "accessoryUpdated", accessory });
    }
  }, CHANGE_DEBOUNCE_MS);
}

function light(id: string): Accessory {
  const accessory = home().accessories.find((a) => a.id === id);
  if (accessory?.kind !== "light") throw new ApiError(404, "not_found", "No such light.");
  if (!accessory.reachable) throw new ApiError(503, "unreachable", `${accessory.name} isn't responding.`);
  return accessory;
}

function parse<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw new ApiError(400, "invalid_request", (e as Error).message);
  }
}

const routes: Route[] = [
  [
    "GET",
    /^\/v1\/capabilities$/,
    async () => ({ capabilities: { lights: true, scenes: true, pairing: true, rename: true, groups: true } satisfies Capabilities }),
  ],
  ["GET", /^\/v1\/home$/, async () => (last = home())],
  [
    "PATCH",
    /^\/v1\/home$/,
    async (_, body) => {
      parse(() => store.updateSettings(body));
      scheduleChange();
    },
  ],
  [
    "PATCH",
    /^\/v1\/accessories\/([^/]+)$/,
    async ([id], body) => {
      if (id.startsWith(GROUP_PREFIX)) {
        if (!parse(() => groups.update(id, body, lightIds()))) throw new ApiError(404, "not_found", "No such group.");
      } else {
        if (!lightIds().has(id)) throw new ApiError(404, "not_found", "No such accessory.");
        store.update(id, parse(() => cleanOverride(body)));
      }
      scheduleChange();
    },
  ],
  [
    "PATCH",
    /^\/v1\/accessories\/([^/]+)\/light$/,
    async ([id], body) => {
      const patch = parse(() => cleanLightPatch(body));
      light(id);
      await setLight(id, patch);
    },
  ],
  [
    "POST",
    /^\/v1\/scenes\/([^/]+)\/run$/,
    async ([id]) => {
      const scene = scenes.get(id);
      if (!scene) throw new ApiError(404, "not_found", "No such scene.");
      const results = await Promise.allSettled(scene.actions.map((a) => setLight(a.accessoryId, a.state)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) console.warn(`Scene "${scene.name}": ${failed} of ${results.length} actions failed`);
    },
  ],
  [
    "POST",
    /^\/v1\/scenes$/,
    async (_, body) => {
      const scene = parse(() => scenes.create(body));
      scheduleChange();
      return scene;
    },
  ],
  [
    "PUT",
    /^\/v1\/scenes\/([^/]+)$/,
    async ([id], body) => {
      const scene = parse(() => scenes.update(id, body));
      if (!scene) throw new ApiError(404, "not_found", "No such scene.");
      scheduleChange();
      return scene;
    },
  ],
  [
    "DELETE",
    /^\/v1\/scenes\/([^/]+)$/,
    async ([id]) => {
      if (!scenes.delete(id)) throw new ApiError(404, "not_found", "No such scene.");
      scheduleChange();
    },
  ],
  [
    "POST",
    /^\/v1\/groups$/,
    async (_, body) => {
      const group = parse(() => groups.create(body, lightIds()));
      scheduleChange();
      return group;
    },
  ],
  [
    "PUT",
    /^\/v1\/groups\/([^/]+)$/,
    async ([id], body) => {
      const group = parse(() => groups.update(id, body, lightIds()));
      if (!group) throw new ApiError(404, "not_found", "No such group.");
      scheduleChange();
      return group;
    },
  ],
  [
    "DELETE",
    /^\/v1\/groups\/([^/]+)$/,
    async ([id]) => {
      if (!groups.delete(id)) throw new ApiError(404, "not_found", "No such group.");
      scheduleChange();
    },
  ],
  [
    "POST",
    /^\/v1\/matter\/commission$/,
    async (_, body) => {
      const raw = (body ?? {}) as { code?: unknown; name?: unknown; room?: unknown };
      if (typeof raw.code !== "string" || !raw.code.trim()) throw new ApiError(400, "invalid_request", "Send the setup code as {\"code\": \"...\"}.");
      const details = parse(() => cleanOverride({ name: raw.name, room: raw.room }));
      if (matter.commissioning) throw new ApiError(409, "busy", "Already pairing another accessory.");
      let nodeId: string;
      try {
        nodeId = await matter.commission(raw.code);
      } catch (e) {
        throw new ApiError(422, "pairing_failed", (e as Error).message);
      }
      const added = matter.lights().filter((l) => l.nodeId === nodeId);
      added.forEach((l, i) =>
        store.update(l.id, { ...details, name: details.name && added.length > 1 ? `${details.name} ${i + 1}` : details.name })
      );
      scheduleChange();
      return { nodeId, accessories: home().accessories.filter((a) => a.kind === "light" && a.matterNodeId === nodeId) };
    },
  ],
  [
    "DELETE",
    /^\/v1\/matter\/nodes\/(\d+)$/,
    async ([nodeId]) => {
      try {
        await matter.remove(nodeId);
      } catch (e) {
        throw new ApiError(404, "not_found", (e as Error).message);
      }
      store.forget(`matter-${nodeId}-`);
      groups.forget(`matter-${nodeId}-`);
    },
  ],
];

const http = startHttp({ token, port, host }, routes);
http.server.on("error", (e) => {
  console.error(`Couldn't start the server: ${e.message}`);
  process.exit(1);
});

const shutdown = async () => {
  http.server.close();
  await matter.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// the desktop app keeps our stdin open; when it goes away (even if it crashed) we follow
if (process.env.RYHOME_PARENT_PIPE === "1") {
  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);
  process.stdin.resume();
}

await new Promise<void>((resolve) => http.server.once("listening", resolve));
await matter.start();
last = home();
console.log(`RYHOME_READY ${JSON.stringify({ host, port })}`);
if (!process.env.RYHOME_TOKEN) console.log(`No RYHOME_TOKEN set, using ${token}`);
