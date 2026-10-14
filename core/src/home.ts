import type { AccessoryStore } from "./accessories.js";
import type { GroupStore } from "./groups.js";
import type { MatterHub } from "./matter.js";
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
  const lights: LightAccessory[] = [];

  for (const light of matter.lights()) {
    const override = store.get(light.id);
    if (override.hidden) continue;
    lights.push({
      id: light.id,
      kind: "light",
      matterNodeId: light.nodeId,
      groupId: groups.groupOf(light.id)?.id,
      name: override.name ?? light.fallbackName,
      roomId: roomId(override.room ?? DEFAULT_ROOM),
      icon: override.icon ?? "bulb",
      reachable: light.reachable,
      supports: light.supports,
      state: light.state,
    });
  }

  const byId = new Map(lights.map((l) => [l.id, l]));
  const groupAccessories: LightAccessory[] = [];
  for (const group of groups.groups) {
    const members = group.members.flatMap((id) => byId.get(id) ?? []);
    if (members.length < 2) {
      members.forEach((m) => delete m.groupId);
      continue;
    }
    groupAccessories.push({
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

  const accessories: Accessory[] = [...lights, ...groupAccessories];
  const usedRooms = new Set(accessories.filter((a) => !(a.kind === "light" && a.groupId)).map((a) => a.roomId));

  return {
    id: "home",
    name: store.settings.name ?? "Home",
    temperatureUnit: store.settings.temperatureUnit ?? defaultUnit(),
    rooms: [...rooms.values()].filter((r) => usedRooms.has(r.id)).sort((a, b) => a.name.localeCompare(b.name)),
    accessories,
    scenes: scenes.scenes,
  };
}
