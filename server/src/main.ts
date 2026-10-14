import { ClimatePoller } from "./climate.js";
import { loadConfig, saveConfig } from "./config.js";
import { buildHome } from "./home.js";
import { homeKitInfo, refreshHomeKit } from "./homekit.js";
import { ApiError, startHttp, type Route } from "./http.js";
import { LinkStore } from "./links.js";
import { MatterHub } from "./matter.js";
import { pairingCode, printPairing } from "./pairing.js";
import { cleanLightPatch, SceneStore } from "./scenes.js";
import type { Accessory, Capabilities, Home } from "./types.js";

const CHANGE_DEBOUNCE_MS = 50;

const args = process.argv.slice(2);
const config = loadConfig();

function flag(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

if (args.includes("--pairing-code")) {
  console.log(pairingCode(config));
  process.exit(0);
}
if (args.includes("--set-port")) {
  const port = Number(flag("--set-port"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be 1-65535");
  saveConfig({ ...config, port });
  console.log(`Port set to ${port}`);
  process.exit(0);
}
if (args.includes("--set-advertised-url")) {
  const url = flag("--set-advertised-url");
  if (!url || !/^https?:\/\//.test(url)) throw new Error("Advertised URL must start with http:// or https://");
  saveConfig({ ...config, advertisedURL: url.replace(/\/+$/, "") });
  console.log(`Advertised URL set to ${url}`);
  process.exit(0);
}

let last: Home | null = null;
let changeTimer: NodeJS.Timeout | null = null;

const scenes = new SceneStore();
const links = new LinkStore();
const matter = new MatterHub(() => scheduleChange());
const climate = new ClimatePoller(config.climateShortcut ?? "RyHome Climate", () => scheduleChange());
const home = () => buildHome(config, matter, climate, scenes, links);

function homeKitAccessory(id: unknown) {
  if (id === undefined || id === null) return null;
  refreshHomeKit();
  const match = homeKitInfo()?.accessories.find((a) => a.id === id);
  if (!match) throw new ApiError(400, "invalid_request", "That Home app accessory wasn't found.");
  return match.id;
}

const shape = (h: Home) =>
  JSON.stringify([h.name, h.temperatureUnit, h.rooms, h.scenes, h.accessories.map((a) => [a.id, a.name, a.roomId])]);

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

function invalid(e: unknown): never {
  throw new ApiError(400, "invalid_request", (e as Error).message);
}

const routes: Route[] = [
  [
    "GET",
    /^\/v1\/capabilities$/,
    async () => ({
      capabilities: {
        lights: true,
        climate: climate.available,
        scenes: true,
        pairing: true,
        homeKitNames: homeKitInfo() !== null,
      } satisfies Capabilities,
    }),
  ],
  ["GET", /^\/v1\/home$/, async () => (last = home())],
  [
    "PATCH",
    /^\/v1\/accessories\/([^/]+)\/light$/,
    async ([id], body) => {
      let patch;
      try {
        patch = cleanLightPatch(body);
      } catch (e) {
        invalid(e);
      }
      light(id);
      await matter.setLight(id, patch);
    },
  ],
  [
    "POST",
    /^\/v1\/scenes\/([^/]+)\/run$/,
    async ([id]) => {
      const scene = scenes.get(id);
      if (!scene) throw new ApiError(404, "not_found", "No such scene.");
      const results = await Promise.allSettled(scene.actions.map((a) => matter.setLight(a.accessoryId, a.state)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) console.warn(`Scene "${scene.name}": ${failed} of ${results.length} actions failed`);
    },
  ],
  [
    "POST",
    /^\/v1\/scenes$/,
    async (_, body) => {
      try {
        const scene = scenes.create(body);
        scheduleChange();
        return scene;
      } catch (e) {
        invalid(e);
      }
    },
  ],
  [
    "PUT",
    /^\/v1\/scenes\/([^/]+)$/,
    async ([id], body) => {
      let scene;
      try {
        scene = scenes.update(id, body);
      } catch (e) {
        invalid(e);
      }
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
    "GET",
    /^\/v1\/homekit\/accessories$/,
    async () => {
      refreshHomeKit();
      const info = homeKitInfo();
      if (!info) throw new ApiError(503, "permission_required", "Give ryhome-server Full Disk Access on the Mac to see Home app accessories.");
      const linkedTo = new Map(Object.entries(links.links).map(([nodeId, id]) => [id, nodeId]));
      return info.accessories
        .filter((a) => a.vendorId !== null)
        .map((a) => ({ id: a.id, name: a.name, room: a.room, model: a.model, linkedNodeId: linkedTo.get(a.id) ?? null }));
    },
  ],
  [
    "POST",
    /^\/v1\/matter\/commission$/,
    async (_, body) => {
      const { code, homeKitId } = (body ?? {}) as { code?: unknown; homeKitId?: unknown };
      if (typeof code !== "string" || !code.trim()) throw new ApiError(400, "invalid_request", "Send the pairing code as {\"code\": \"...\"}.");
      if (matter.commissioning) throw new ApiError(409, "busy", "Already pairing another accessory.");
      const link = homeKitAccessory(homeKitId);
      let nodeId: string;
      try {
        nodeId = await matter.commission(code);
      } catch (e) {
        throw new ApiError(422, "pairing_failed", (e as Error).message);
      }
      if (link) links.set(nodeId, link);
      scheduleChange();
      return { nodeId, accessories: home().accessories.filter((a) => a.id.startsWith(`matter-${nodeId}-`)) };
    },
  ],
  [
    "PUT",
    /^\/v1\/matter\/nodes\/(\d+)\/link$/,
    async ([nodeId], body) => {
      if (!matter.lights().some((l) => l.nodeId === nodeId)) throw new ApiError(404, "not_found", "No such node.");
      links.set(nodeId, homeKitAccessory((body as { homeKitId?: unknown } | undefined)?.homeKitId));
      scheduleChange();
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
      links.set(nodeId, null);
    },
  ],
];

const http = startHttp(config, routes);
http.server.on("listening", () => printPairing(config));
http.server.on("error", (e) => {
  console.error(`Couldn't start the server: ${e.message}`);
  process.exit(1);
});

await matter.start();
climate.start();
last = home();

const shutdown = async () => {
  climate.stop();
  http.server.close();
  await matter.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
