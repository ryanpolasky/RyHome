import { invoke } from "@tauri-apps/api/core";
import type { RyHomeBridge } from "./api/bridge";
import { createMockBridge } from "./api/mockBridge";
import { RemoteBridge } from "./api/remoteBridge";
import { isDesktop } from "./desktop";

export type Mode = "local" | "demo";

const STORAGE_KEY = "ryhome.mode";

export function loadMode(): Mode | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "demo") return "demo";
  return isDesktop ? "local" : null;
}

export function saveMode(mode: Mode | null): void {
  if (mode === "demo") localStorage.setItem(STORAGE_KEY, mode);
  else localStorage.removeItem(STORAGE_KEY);
}

export async function createBridge(mode: Mode): Promise<RyHomeBridge> {
  if (mode === "demo") return createMockBridge();
  const { url, token } = await invoke<{ url: string; token: string }>("core_connection");
  return new RemoteBridge(url, token);
}
