import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LightIcon } from "./types.js";

export interface AccessoryOverride {
  name?: string;
  room?: string;
  icon?: LightIcon;
  hidden?: boolean;
}

export interface ServerConfig {
  token: string;
  port: number;
  advertisedHost?: string;
  advertisedURL?: string;
  allowedOrigins?: string[];
  homeName?: string;
  temperatureUnit?: "C" | "F";
  climateShortcut?: string;
  accessories?: Record<string, AccessoryOverride>;
}

export const dataDir = process.env.RYHOME_HOME ?? join(homedir(), ".ryhome");
export const configFile = join(dataDir, "config.json");

export function writePrivate(file: string, contents: string) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, contents, { mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}

export function saveConfig(config: ServerConfig) {
  writePrivate(configFile, `${JSON.stringify(config, null, 2)}\n`);
}

export function loadConfig(): ServerConfig {
  let config: ServerConfig;
  if (existsSync(configFile)) {
    config = JSON.parse(readFileSync(configFile, "utf8"));
  } else {
    config = { token: randomBytes(32).toString("base64url"), port: 8788 };
    saveConfig(config);
  }
  if (process.env.RYHOME_TOKEN) config.token = process.env.RYHOME_TOKEN;
  return config;
}
