import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const dataDir = process.env.RYHOME_HOME ?? join(homedir(), ".ryhome");

export function writePrivate(file: string, contents: string) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, contents, { mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}

export function readJson<T>(name: string, fallback: T): T {
  const file = join(dataDir, name);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback;
}

export function writeJson(name: string, value: unknown) {
  writePrivate(join(dataDir, name), `${JSON.stringify(value, null, 2)}\n`);
}
