import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const ENGINE_NAMES = /^(node|ryhome-core)(\.exe)?$/i;

function processName(pid: number): string | null {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
      const match = /^"([^"]+)"/.exec(out.trim());
      return match ? match[1] : null;
    }
    return execFileSync("ps", ["-p", String(pid), "-o", "comm="], { encoding: "utf8" }).trim().split("/").pop() || null;
  } catch {
    return null;
  }
}

// matter.js only checks that the lock's pid is alive, so a pid reused by some other program would block us forever
export function clearForeignLock(storageDir: string) {
  const pidFile = join(storageDir, "matter.pid");
  const lockFile = join(storageDir, "matter.lock");
  if (!existsSync(lockFile) || !existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, "utf8").trim().split(/\s+/)[0]);
  if (!Number.isInteger(pid) || pid === process.pid) return;
  const name = processName(pid);
  if (name && ENGINE_NAMES.test(name)) return;
  console.warn(`Clearing a stale storage lock left by pid ${pid}${name ? ` (now ${name})` : ""}`);
  rmSync(lockFile, { force: true });
  rmSync(pidFile, { force: true });
}
