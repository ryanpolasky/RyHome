import type { ColorPreset } from "./types.js";

export type StoredPreset = Omit<ColorPreset, "custom"> | null;

export const DEFAULT_PRESETS: Omit<ColorPreset, "custom">[] = [
  { colorMode: "temperature", colorTemperature: 454, hue: 30, saturation: 50 },
  { colorMode: "temperature", colorTemperature: 370, hue: 35, saturation: 40 },
  { colorMode: "temperature", colorTemperature: 250, hue: 45, saturation: 15 },
  { colorMode: "temperature", colorTemperature: 160, hue: 210, saturation: 10 },
  { colorMode: "hs", hue: 0, saturation: 85, colorTemperature: 370 },
  { colorMode: "hs", hue: 28, saturation: 90, colorTemperature: 370 },
  { colorMode: "hs", hue: 270, saturation: 75, colorTemperature: 370 },
  { colorMode: "hs", hue: 215, saturation: 80, colorTemperature: 370 },
];

const clamp = (value: unknown, min: number, max: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Preset values must be numbers");
  return Math.round(Math.min(max, Math.max(min, value)));
};

// null means "use the default for this slot"
export function cleanPresets(input: unknown): StoredPreset[] {
  if (!Array.isArray(input) || input.length !== DEFAULT_PRESETS.length) {
    throw new Error(`colorPresets must be a list of ${DEFAULT_PRESETS.length} entries`);
  }
  return input.map((raw) => {
    if (raw === null) return null;
    const p = raw as Record<string, unknown>;
    if (p.colorMode !== "hs" && p.colorMode !== "temperature") throw new Error("colorMode must be hs or temperature");
    return {
      colorMode: p.colorMode,
      hue: clamp(p.hue, 0, 360),
      saturation: clamp(p.saturation, 0, 100),
      colorTemperature: clamp(p.colorTemperature, 100, 1000),
    };
  });
}

export function resolvePresets(stored: StoredPreset[] | undefined): ColorPreset[] {
  return DEFAULT_PRESETS.map((fallback, i) => {
    const custom = stored?.[i];
    return custom ? { ...custom, custom: true } : { ...fallback, custom: false };
  });
}
