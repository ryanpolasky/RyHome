import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "./config.js";
import type { LightState, Scene, SceneAction } from "./types.js";

const FILE = "scenes.json";
const types: Scene["type"][] = ["wakeUp", "sleep", "departure", "arrival", "custom"];
const lightKeys: (keyof LightState)[] = ["on", "brightness", "hue", "saturation", "colorTemperature", "colorMode"];

export function cleanLightPatch(input: unknown): Partial<LightState> {
  if (!input || typeof input !== "object") throw new Error("Expected a light state object");
  const raw = input as Record<string, unknown>;
  const patch: Partial<LightState> = {};
  for (const key of lightKeys) {
    const value = raw[key];
    if (value === undefined) continue;
    if (key === "on") {
      if (typeof value !== "boolean") throw new Error("on must be a boolean");
      patch.on = value;
    } else if (key === "colorMode") {
      if (value !== "hs" && value !== "temperature") throw new Error("colorMode must be hs or temperature");
      patch.colorMode = value;
    } else {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a number`);
      const limits = { brightness: [0, 100], hue: [0, 360], saturation: [0, 100], colorTemperature: [100, 1000] }[key];
      patch[key] = Math.min(limits[1], Math.max(limits[0], value));
    }
  }
  return patch;
}

function cleanScene(input: unknown, id: string): Scene {
  const raw = (input ?? {}) as Record<string, unknown>;
  if (typeof raw.name !== "string" || !raw.name.trim()) throw new Error("Scene needs a name");
  if (!Array.isArray(raw.actions)) throw new Error("Scene needs an actions array");
  const actions: SceneAction[] = raw.actions.map((a) => {
    const action = (a ?? {}) as Record<string, unknown>;
    if (typeof action.accessoryId !== "string") throw new Error("Each action needs an accessoryId");
    return { accessoryId: action.accessoryId, state: cleanLightPatch(action.state) };
  });
  const type = types.includes(raw.type as Scene["type"]) ? (raw.type as Scene["type"]) : "custom";
  return { id, name: raw.name.trim(), type, actions };
}

export class SceneStore {
  scenes = readJson<Scene[]>(FILE, []);

  #save() {
    writeJson(FILE, this.scenes);
  }

  get(id: string) {
    return this.scenes.find((s) => s.id === id);
  }

  create(input: unknown): Scene {
    const scene = cleanScene(input, randomUUID());
    this.scenes.push(scene);
    this.#save();
    return scene;
  }

  update(id: string, input: unknown): Scene | undefined {
    const index = this.scenes.findIndex((s) => s.id === id);
    if (index < 0) return undefined;
    this.scenes[index] = cleanScene(input, id);
    this.#save();
    return this.scenes[index];
  }

  delete(id: string): boolean {
    const before = this.scenes.length;
    this.scenes = this.scenes.filter((s) => s.id !== id);
    if (this.scenes.length === before) return false;
    this.#save();
    return true;
  }
}
