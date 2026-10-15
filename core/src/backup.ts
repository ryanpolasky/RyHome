import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { dataDir } from "./config.js";

const FORMAT = "ryhome-backup";
const VERSION = 1;
const SKIP = new Set(["backups"]);

interface Backup {
  format: typeof FORMAT;
  version: number;
  createdAt: string;
  files: Record<string, string>;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (dir === dataDir && SKIP.has(name)) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : name.endsWith(".tmp") ? [] : [full];
  });
}

export function createBackup(): Backup {
  const files: Record<string, string> = {};
  for (const file of walk(dataDir)) files[relative(dataDir, file).split(sep).join("/")] = readFileSync(file).toString("base64");
  return { format: FORMAT, version: VERSION, createdAt: new Date().toISOString(), files };
}

export function writeBackup(path: string) {
  writeFileSync(path, JSON.stringify(createBackup()));
}

function readBackup(path: string): Backup {
  let parsed: Backup;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("That file isn't a RyHome backup.");
  }
  if (parsed?.format !== FORMAT || typeof parsed.files !== "object") throw new Error("That file isn't a RyHome backup.");
  if (parsed.version > VERSION) throw new Error("That backup is from a newer version of RyHome.");
  if (!Object.keys(parsed.files).some((f) => f.startsWith("matter/"))) throw new Error("That backup has no Matter pairings in it.");
  return parsed;
}

export function validateBackup(path: string) {
  readBackup(path);
}

// keeps a copy of what's being replaced, then swaps every file for the backup's
export function restoreBackup(path: string): string {
  const backup = readBackup(path);
  const safety = join(dataDir, "backups", `before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(safety), { recursive: true });
  writeFileSync(safety, JSON.stringify(createBackup()));
  for (const name of readdirSync(dataDir)) if (!SKIP.has(name)) rmSync(join(dataDir, name), { recursive: true, force: true });
  for (const [name, content] of Object.entries(backup.files)) {
    const target = resolve(dataDir, name);
    if (!target.startsWith(resolve(dataDir) + sep)) throw new Error(`Backup contains an unsafe path: ${name}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(content, "base64"));
  }
  return safety;
}
