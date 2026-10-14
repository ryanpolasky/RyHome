import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const SHORTCUTS = "/usr/bin/shortcuts";
const POLL_MS = 60_000;
const RECHECK_MS = 10 * 60_000;

export interface ClimateReading {
  room: string | null;
  temperature: number | null;
  humidity: number | null;
}

interface RawReading {
  room?: unknown;
  temperature?: unknown;
  humidity?: unknown;
  unit?: unknown;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function normalize(raw: RawReading): ClimateReading {
  const temperature = toNumber(raw.temperature);
  const fahrenheit = typeof raw.unit === "string" && raw.unit.trim().toUpperCase().startsWith("F");
  return {
    room: typeof raw.room === "string" && raw.room.trim() ? raw.room.trim() : null,
    temperature: temperature === null ? null : fahrenheit ? ((temperature - 32) * 5) / 9 : temperature,
    humidity: toNumber(raw.humidity),
  };
}

// polls an optional user-made shortcut since homepod sensors aren't reachable over matter
export class ClimatePoller {
  readings: ClimateReading[] = [];
  available = false;
  #timer: NodeJS.Timeout | null = null;
  #lastCheck = 0;

  constructor(
    private shortcut: string,
    private onChange: () => void
  ) {}

  start() {
    if (process.platform !== "darwin") return;
    const tick = () => this.#poll().finally(() => (this.#timer = setTimeout(tick, POLL_MS)));
    tick();
  }

  stop() {
    if (this.#timer) clearTimeout(this.#timer);
  }

  async #exists(): Promise<boolean> {
    if (this.available || Date.now() - this.#lastCheck < RECHECK_MS) return this.available;
    this.#lastCheck = Date.now();
    try {
      const { stdout } = await run(SHORTCUTS, ["list"], { timeout: 15_000 });
      this.available = stdout.split("\n").some((line) => line.trim() === this.shortcut);
      if (this.available) console.log(`Found the "${this.shortcut}" shortcut, polling climate sensors`);
    } catch {
      this.available = false;
    }
    return this.available;
  }

  async #poll() {
    if (!(await this.#exists())) return;
    const dir = mkdtempSync(join(tmpdir(), "ryhome-"));
    const out = join(dir, "climate.json");
    try {
      await run(SHORTCUTS, ["run", this.shortcut, "--output-path", out], { timeout: 30_000 });
      const parsed = JSON.parse(readFileSync(out, "utf8")) as RawReading | RawReading[];
      const next = (Array.isArray(parsed) ? parsed : [parsed]).map(normalize);
      if (JSON.stringify(next) !== JSON.stringify(this.readings)) {
        this.readings = next;
        this.onChange();
      }
    } catch (e) {
      console.warn(`Couldn't read the "${this.shortcut}" shortcut:`, (e as Error).message);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
