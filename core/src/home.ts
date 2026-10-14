import type { AccessoryStore } from "./accessories.js";
import type { MatterHub } from "./matter.js";
import type { SceneStore } from "./scenes.js";
import type { Accessory, Home, Room } from "./types.js";

export const DEFAULT_ROOM = "Default Room";
const FAHRENHEIT_REGIONS = new Set(["US", "LR", "MM", "BS", "BZ", "KY", "PW", "FM", "MH"]);

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "room";
}

function defaultUnit(): "C" | "F" {
  const region = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale).maximize().region;
  return region && FAHRENHEIT_REGIONS.has(region) ? "F" : "C";
}

export function buildHome(matter: MatterHub, scenes: SceneStore, store: AccessoryStore): Home {
  const rooms = new Map<string, Room>();
  const roomId = (name: string) => {
    const id = slug(name);
    if (!rooms.has(id)) rooms.set(id, { id, name });
    return id;
  };
  const accessories: Accessory[] = [];

  for (const light of matter.lights()) {
    const override = store.get(light.id);
    if (override.hidden) continue;
    accessories.push({
      id: light.id,
      kind: "light",
      matterNodeId: light.nodeId,
      name: override.name ?? light.fallbackName,
      roomId: roomId(override.room ?? DEFAULT_ROOM),
      icon: override.icon ?? "bulb",
      reachable: light.reachable,
      supports: light.supports,
      state: light.state,
    });
  }

  return {
    id: "home",
    name: store.settings.name ?? "Home",
    temperatureUnit: store.settings.temperatureUnit ?? defaultUnit(),
    rooms: [...rooms.values()].sort((a, b) => a.name.localeCompare(b.name)),
    accessories,
    scenes: scenes.scenes,
  };
}
