import { createContext } from "react";
import type { Accessory, Home, LightState, SensorType } from "./api/types";

export type CategoryId = "climate" | "lights" | "power" | "security" | "media";

export type View =
  | { type: "home" }
  | { type: "category"; id: CategoryId }
  | { type: "room"; id: string };

export const categories: { id: CategoryId; name: string }[] = [
  { id: "climate", name: "Climate" },
  { id: "lights", name: "Lights" },
  { id: "power", name: "Plugs & Switches" },
  { id: "security", name: "Security" },
  { id: "media", name: "Speakers & TVs" },
];

export type TemperatureUnit = Home["temperatureUnit"];

export const UnitContext = createContext<TemperatureUnit>("C");

export function formatTemperature(celsius: number, unit: TemperatureUnit): string {
  return `${Math.round(unit === "F" ? (celsius * 9) / 5 + 32 : celsius)}°`;
}

export function sensorValue(accessory: Extract<Accessory, { kind: "sensor" }>, unit: TemperatureUnit): string {
  switch (accessory.sensor) {
    case "temperature":
      return formatTemperature(accessory.value, unit);
    case "humidity":
      return `${Math.round(accessory.value)}%`;
    case "illuminance":
      return `${Math.round(accessory.value)} lx`;
    default:
      return accessory.value ? "Yes" : "No";
  }
}

export function categoryOf(accessory: Accessory): CategoryId | null {
  switch (accessory.kind) {
    case "light":
      return "lights";
    case "outlet":
      return "power";
    case "camera":
    case "lock":
      return "security";
    case "sensor":
      return accessory.sensor === "motion" || accessory.sensor === "contact" || accessory.sensor === "leak" ? "security" : "climate";
    case "thermostat":
    case "fan":
    case "blind":
      return "climate";
    case "television":
    case "speaker":
      return "media";
    case "other":
      return null;
  }
}

export function categorySummary(home: Home, id: CategoryId): string | null {
  const items = home.accessories.filter((a) => categoryOf(a) === id && !(a.kind === "light" && a.groupId));
  if (items.length === 0) return null;
  switch (id) {
    case "climate": {
      const temps = items.flatMap((a) =>
        a.kind === "sensor" && a.sensor === "temperature" ? [a.value] : a.kind === "thermostat" && a.current !== null ? [a.current] : []
      );
      if (temps.length === 0) return `${items.length} Accessor${items.length === 1 ? "y" : "ies"}`;
      const lo = formatTemperature(Math.min(...temps), home.temperatureUnit);
      const hi = formatTemperature(Math.max(...temps), home.temperatureUnit);
      return lo === hi ? lo : `${lo.slice(0, -1)}-${hi}`;
    }
    case "lights":
    case "power": {
      const on = items.filter(isActive).length;
      return on === 0 ? "All Off" : `${on} On`;
    }
    case "security": {
      if (items.some((a) => a.kind === "sensor" && a.sensor === "leak" && a.value)) return "Leak Detected";
      if (items.some((a) => a.kind === "lock" && a.locked === false)) return "Unlocked";
      if (items.some((a) => (a.kind === "camera" && a.motion) || (a.kind === "sensor" && a.sensor === "motion" && a.value))) return "Motion Detected";
      return "No Alerts";
    }
    case "media": {
      const playing = items.filter(isActive).length;
      return playing === 0 ? "None Playing" : `${playing} Playing`;
    }
  }
}

export function isActive(accessory: Accessory): boolean {
  switch (accessory.kind) {
    case "light":
      return accessory.state.on;
    case "outlet":
    case "fan":
      return accessory.on;
    case "lock":
      return accessory.locked === false;
    case "blind":
      return (accessory.position ?? 0) > 0;
    case "thermostat":
      return accessory.mode !== "off";
    case "sensor":
      return accessory.sensor !== "temperature" && accessory.sensor !== "humidity" && accessory.sensor !== "illuminance" && accessory.value > 0;
    case "television":
    case "speaker":
      return accessory.playing;
    default:
      return false;
  }
}

const SENSOR_STATES: Partial<Record<SensorType, [string, string]>> = {
  motion: ["No Motion", "Motion Detected"],
  contact: ["Open", "Closed"],
  leak: ["No Leak", "Leak Detected"],
};

export function statusText(accessory: Accessory, unit: TemperatureUnit): string {
  if (!accessory.reachable) return "No Response";
  switch (accessory.kind) {
    case "light":
      if (!accessory.state.on) return "Off";
      return accessory.supports.brightness ? `${accessory.state.brightness}%` : "On";
    case "outlet":
      if (!accessory.on) return "Off";
      return accessory.brightness !== null ? `${accessory.brightness}%` : "On";
    case "fan":
      if (!accessory.on) return "Off";
      return accessory.speed !== null ? `${accessory.speed}%` : "On";
    case "lock":
      if (accessory.jammed) return "Jammed";
      return accessory.locked === null ? "Unknown" : accessory.locked ? "Locked" : "Unlocked";
    case "blind":
      if (accessory.position === null) return "Unknown";
      return accessory.position === 0 ? "Closed" : accessory.position === 100 ? "Open" : `${accessory.position}% Open`;
    case "thermostat": {
      if (accessory.mode === "off") return "Off";
      const target = accessory.target !== null ? formatTemperature(accessory.target, unit) : "";
      const verb = { heat: "Heat to", cool: "Cool to", auto: "Auto", other: "Set to" }[accessory.mode];
      return target ? `${verb} ${target}` : verb;
    }
    case "sensor": {
      const states = SENSOR_STATES[accessory.sensor];
      return states ? states[accessory.value ? 1 : 0] : sensorValue(accessory, unit);
    }
    case "other":
      return "Not Supported Yet";
    case "camera":
      return accessory.motion ? "Motion Detected" : "Live";
    case "television":
      return accessory.playing ? accessory.nowPlaying ?? "Playing" : "Off";
    case "speaker":
      return accessory.playing ? accessory.nowPlaying ?? "Playing" : "Paused";
  }
}

const WARM: [number, number, number] = [255, 169, 77];
const COOL: [number, number, number] = [222, 234, 255];
const MIRED_WARM = 500;
const MIRED_COOL = 153;

export function lightIconColor(state: Pick<LightState, "hue" | "saturation" | "colorTemperature" | "colorMode">): string {
  if (state.colorMode === "hs" && state.saturation > 20) return `hsl(${state.hue} 85% 62%)`;
  const t = Math.min(1, Math.max(0, (state.colorTemperature - MIRED_COOL) / (MIRED_WARM - MIRED_COOL)));
  return `hsl(${48 - t * 12} 100% ${58 - t * 4}%)`;
}

export function lightColor(state: Pick<LightState, "hue" | "saturation" | "colorTemperature" | "colorMode">): string {
  if (state.colorMode === "hs") {
    return `hsl(${state.hue} ${Math.max(state.saturation, 15)}% ${88 - state.saturation * 0.33}%)`;
  }
  const t = Math.min(1, Math.max(0, (state.colorTemperature - MIRED_COOL) / (MIRED_WARM - MIRED_COOL)));
  const [r, g, b] = COOL.map((c, i) => Math.round(c + (WARM[i] - c) * t));
  return `rgb(${r} ${g} ${b})`;
}
