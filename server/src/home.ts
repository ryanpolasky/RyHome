import type { ClimatePoller } from "./climate.js";
import type { ServerConfig } from "./config.js";
import { homeKitInfo } from "./homekit.js";
import type { LinkStore } from "./links.js";
import type { MatterHub } from "./matter.js";
import type { SceneStore } from "./scenes.js";
import type { Accessory, Home, Room } from "./types.js";

const UNASSIGNED = "Default Room";
const FAHRENHEIT_REGIONS = new Set(["US", "LR", "MM", "BS", "BZ", "KY", "PW", "FM", "MH"]);

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "room";
}

function defaultUnit(): "C" | "F" {
  const region = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale).maximize().region;
  return region && FAHRENHEIT_REGIONS.has(region) ? "F" : "C";
}

export function buildHome(
  config: ServerConfig,
  matter: MatterHub,
  climate: ClimatePoller,
  scenes: SceneStore,
  links: LinkStore
): Home {
  const homeKit = homeKitInfo();
  const lights = matter.lights();
  const linked = links.resolve(lights, homeKit);
  const rooms = new Map<string, Room>();
  const roomId = (name: string) => {
    const id = slug(name);
    if (!rooms.has(id)) rooms.set(id, { id, name });
    return id;
  };
  const accessories: Accessory[] = [];

  for (const light of lights) {
    const override = config.accessories?.[light.id] ?? {};
    if (override.hidden) continue;
    const known = linked.get(light.nodeId);
    accessories.push({
      id: light.id,
      kind: "light",
      matterNodeId: light.nodeId,
      linked: !!known,
      name: override.name ?? known?.name ?? light.fallbackName,
      roomId: roomId(override.room ?? known?.room ?? UNASSIGNED),
      icon: override.icon ?? "bulb",
      reachable: light.reachable,
      supports: light.supports,
      state: light.state,
    });
  }

  for (const reading of climate.readings) {
    const room = reading.room ?? UNASSIGNED;
    const base = `climate-${slug(room)}`;
    if (reading.temperature !== null) {
      accessories.push({
        id: `${base}-temperature`,
        kind: "sensor",
        sensor: "temperature",
        name: "Temperature",
        roomId: roomId(room),
        reachable: true,
        value: Math.round(reading.temperature * 10) / 10,
      });
    }
    if (reading.humidity !== null) {
      accessories.push({
        id: `${base}-humidity`,
        kind: "sensor",
        sensor: "humidity",
        name: "Humidity",
        roomId: roomId(room),
        reachable: true,
        value: Math.round(reading.humidity),
      });
    }
  }

  return {
    id: "home",
    name: config.homeName ?? homeKit?.homeName ?? "Home",
    temperatureUnit: config.temperatureUnit ?? defaultUnit(),
    rooms: [...rooms.values()].sort((a, b) => a.name.localeCompare(b.name)),
    accessories,
    scenes: scenes.scenes,
  };
}
