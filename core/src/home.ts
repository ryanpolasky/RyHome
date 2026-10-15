import type { AccessoryStore } from "./accessories.js";
import type { GroupStore } from "./groups.js";
import type { MatterHub } from "./matter.js";
import { resolvePresets } from "./presets.js";
import type { SceneStore } from "./scenes.js";
import type { Accessory, Home, LightAccessory, LightState, Room } from "./types.js";

export const DEFAULT_ROOM = "Default Room";
const FAHRENHEIT_REGIONS = new Set(["US", "LR", "MM", "BS", "BZ", "KY", "PW", "FM", "MH"]);

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "room";
}

function defaultUnit(): "C" | "F" {
  const region = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale).maximize().region;
  return region && FAHRENHEIT_REGIONS.has(region) ? "F" : "C";
}

// a group reads as on when any member is, at the average brightness of the ones that are on
function combinedState(members: LightAccessory[]): LightState {
  const lit = members.filter((m) => m.state.on && m.reachable);
  const lead = lit[0] ?? members[0];
  const pool = lit.length > 0 ? lit : members;
  return {
    ...lead.state,
    on: lit.length > 0,
    brightness: Math.round(pool.reduce((sum, m) => sum + m.state.brightness, 0) / pool.length),
  };
}

export function buildHome(matter: MatterHub, scenes: SceneStore, store: AccessoryStore, groups: GroupStore): Home {
  const rooms = new Map<string, Room>();
  const roomId = (name: string) => {
    const id = slug(name);
    if (!rooms.has(id)) rooms.set(id, { id, name });
    return id;
  };
  const accessories: Accessory[] = [];
  const lights: LightAccessory[] = [];

  for (const device of matter.devices()) {
    const override = store.get(device.id);
    if (override.hidden) continue;
    const { nodeId, fallbackName, ...rest } = device;
    const shared = { matterNodeId: nodeId, name: override.name ?? fallbackName, roomId: roomId(override.room ?? DEFAULT_ROOM) };
    if (rest.kind === "light") {
      const light: LightAccessory = { ...rest, ...shared, groupId: groups.groupOf(device.id)?.id, icon: override.icon ?? "bulb" };
      lights.push(light);
      accessories.push(light);
    } else {
      accessories.push({ ...rest, ...shared } as Accessory);
    }
  }

  const byId = new Map(lights.map((l) => [l.id, l]));
  for (const group of groups.groups) {
    const members = group.members.flatMap((id) => byId.get(id) ?? []);
    if (members.length < 2) {
      members.forEach((m) => delete m.groupId);
      continue;
    }
    accessories.push({
      id: group.id,
      kind: "light",
      members: members.map((m) => m.id),
      name: group.name,
      roomId: roomId(group.room ?? DEFAULT_ROOM),
      icon: group.icon,
      reachable: members.some((m) => m.reachable),
      supports: {
        brightness: members.some((m) => m.supports.brightness),
        color: members.some((m) => m.supports.color),
        temperature: members.some((m) => m.supports.temperature),
      },
      state: combinedState(members),
    });
  }

  const usedRooms = new Set(accessories.filter((a) => !(a.kind === "light" && a.groupId)).map((a) => a.roomId));

  return {
    id: "home",
    name: store.settings.name ?? "Home",
    temperatureUnit: store.settings.temperatureUnit ?? defaultUnit(),
    colorPresets: resolvePresets(store.settings.colorPresets),
    rooms: [...rooms.values()].filter((r) => usedRooms.has(r.id)).sort((a, b) => a.name.localeCompare(b.name)),
    accessories,
    scenes: structuredClone(scenes.scenes),
  };
}
