import { createContext } from "react";
import type { Accessory, Home, LightState } from "./api/types";

export type CategoryId = "climate" | "lights" | "security" | "media";

export type View =
  | { type: "home" }
  | { type: "category"; id: CategoryId }
  | { type: "room"; id: string };

export const categories: { id: CategoryId; name: string }[] = [
  { id: "climate", name: "Climate" },
  { id: "lights", name: "Lights" },
  { id: "security", name: "Security" },
  { id: "media", name: "Speakers & TVs" },
];

export function categoryOf(accessory: Accessory): CategoryId {
  switch (accessory.kind) {
    case "light":
      return "lights";
    case "camera":
      return "security";
    case "sensor":
      return "climate";
    case "television":
    case "speaker":
      return "media";
  }
}

export type TemperatureUnit = Home["temperatureUnit"];

export const UnitContext = createContext<TemperatureUnit>("C");

export function formatTemperature(celsius: number, unit: TemperatureUnit): string {
  return `${Math.round(unit === "F" ? (celsius * 9) / 5 + 32 : celsius)}°`;
}

export function sensorValue(accessory: Extract<Accessory, { kind: "sensor" }>, unit: TemperatureUnit): string {
  return accessory.sensor === "temperature" ? formatTemperature(accessory.value, unit) : `${Math.round(accessory.value)}%`;
}

export function categorySummary(home: Home, id: CategoryId): string | null {
  const items = home.accessories.filter((a) => categoryOf(a) === id);
  if (items.length === 0) return null;
  switch (id) {
    case "climate": {
      const temps = items.flatMap((a) => (a.kind === "sensor" && a.sensor === "temperature" ? [a.value] : []));
      if (temps.length === 0) return "No Sensors";
      const lo = formatTemperature(Math.min(...temps), home.temperatureUnit);
      const hi = formatTemperature(Math.max(...temps), home.temperatureUnit);
      return lo === hi ? lo : `${lo.slice(0, -1)}-${hi}`;
    }
    case "lights": {
      const on = items.filter((a) => a.kind === "light" && a.state.on).length;
      return on === 0 ? "All Off" : `${on} On`;
    }
    case "security":
      return items.some((a) => a.kind === "camera" && a.motion) ? "Motion Detected" : "No Alerts";
    case "media": {
      const playing = items.filter((a) => (a.kind === "speaker" || a.kind === "television") && a.playing).length;
      return playing === 0 ? "None Playing" : `${playing} Playing`;
    }
  }
}

export function isActive(accessory: Accessory): boolean {
  switch (accessory.kind) {
    case "light":
      return accessory.state.on;
    case "television":
    case "speaker":
      return accessory.playing;
    default:
      return false;
  }
}

export function statusText(accessory: Accessory, unit: TemperatureUnit): string {
  if (!accessory.reachable) return "No Response";
  switch (accessory.kind) {
    case "light":
      if (!accessory.state.on) return "Off";
      return accessory.supports.brightness ? `${accessory.state.brightness}%` : "On";
    case "camera":
      return accessory.motion ? "Motion Detected" : "Live";
    case "television":
      return accessory.playing ? accessory.nowPlaying ?? "Playing" : "Off";
    case "speaker":
      return accessory.playing ? accessory.nowPlaying ?? "Playing" : "Paused";
    case "sensor":
      return sensorValue(accessory, unit);
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
