import { readJson, writeJson } from "./config.js";
import type { LightIcon } from "./types.js";

export interface AccessoryOverride {
  name?: string;
  room?: string;
  icon?: LightIcon;
  hidden?: boolean;
}

export interface HomeSettings {
  name?: string;
  temperatureUnit?: "C" | "F";
}

const icons: LightIcon[] = ["bulb", "ceiling", "floorLamp", "tableLamp", "lightstrip"];
const FILE = "accessories.json";
const SETTINGS = "settings.json";

function text(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be text`);
  const trimmed = value.trim().slice(0, 60);
  return trimmed || undefined;
}

export function cleanOverride(input: unknown): AccessoryOverride {
  const raw = (input ?? {}) as Record<string, unknown>;
  if (raw.icon != null && !icons.includes(raw.icon as LightIcon)) throw new Error(`icon must be one of ${icons.join(", ")}`);
  if (raw.hidden != null && typeof raw.hidden !== "boolean") throw new Error("hidden must be a boolean");
  return {
    ...("name" in raw ? { name: text(raw.name, "name") } : {}),
    ...("room" in raw ? { room: text(raw.room, "room") } : {}),
    ...("icon" in raw ? { icon: (raw.icon ?? undefined) as LightIcon | undefined } : {}),
    ...("hidden" in raw ? { hidden: (raw.hidden ?? undefined) as boolean | undefined } : {}),
  };
}

export class AccessoryStore {
  overrides = readJson<Record<string, AccessoryOverride>>(FILE, {});
  settings = readJson<HomeSettings>(SETTINGS, {});

  get(id: string): AccessoryOverride {
    return this.overrides[id] ?? {};
  }

  update(id: string, patch: AccessoryOverride) {
    const next: AccessoryOverride = { ...this.get(id), ...patch };
    for (const key of Object.keys(next) as (keyof AccessoryOverride)[]) if (next[key] === undefined) delete next[key];
    if (Object.keys(next).length === 0) delete this.overrides[id];
    else this.overrides[id] = next;
    writeJson(FILE, this.overrides);
  }

  forget(prefix: string) {
    for (const id of Object.keys(this.overrides)) if (id.startsWith(prefix)) delete this.overrides[id];
    writeJson(FILE, this.overrides);
  }

  updateSettings(input: unknown) {
    const raw = (input ?? {}) as Record<string, unknown>;
    if (raw.temperatureUnit !== undefined && raw.temperatureUnit !== "C" && raw.temperatureUnit !== "F") {
      throw new Error("temperatureUnit must be C or F");
    }
    this.settings = {
      ...this.settings,
      ...("name" in raw ? { name: text(raw.name, "name") } : {}),
      ...(raw.temperatureUnit ? { temperatureUnit: raw.temperatureUnit as "C" | "F" } : {}),
    };
    writeJson(SETTINGS, this.settings);
  }
}
