import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

export const isDesktop = isTauri();

export const windowControls = {
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
};

export function hideOnMinimize(): () => void {
  const window = getCurrentWindow();
  const pending = window.onResized(async () => {
    if (await window.isMinimized()) await window.hide();
  });
  return () => {
    pending.then((unlisten) => unlisten());
  };
}

export function getLaunchAtLogin(): Promise<boolean> {
  return isEnabled();
}

export function setLaunchAtLogin(enabled: boolean): Promise<void> {
  return enabled ? enable() : disable();
}

export function appVersion(): Promise<string> {
  return isDesktop ? getVersion() : Promise.resolve("demo");
}

export function quitApp(): Promise<void> {
  return invoke("quit");
}
