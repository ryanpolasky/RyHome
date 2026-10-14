import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const client = join(dirname(fileURLToPath(import.meta.url)), "..");
const core = join(client, "..", "core");
const tauri = join(client, "src-tauri");
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit" });

if (!existsSync(join(core, "node_modules"))) run("npm ci --no-fund --no-audit", core);
run("npm run bundle --silent", core);
mkdirSync(join(tauri, "core"), { recursive: true });
copyFileSync(join(core, "dist", "core.mjs"), join(tauri, "core", "core.mjs"));

// tauri wants sidecars named with the rust target triple; we ship this machine's node as the runtime
const triple = /host: (\S+)/.exec(execSync("rustc -vV").toString())[1];
const ext = process.platform === "win32" ? ".exe" : "";
const target = join(tauri, "binaries", `ryhome-core-${triple}${ext}`);
mkdirSync(dirname(target), { recursive: true });
if (!existsSync(target) || statSync(target).size !== statSync(process.execPath).size) {
  copyFileSync(process.execPath, target);
  console.log(`Bundled Node ${process.version} as the RyHome engine`);
}
