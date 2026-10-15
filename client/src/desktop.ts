import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open, save } from "@tauri-apps/plugin-dialog";

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

const BACKUP_FILTER = [{ name: "RyHome backup", extensions: ["json"] }];

export function pickBackupSave(): Promise<string | null> {
  const date = new Date().toISOString().slice(0, 10);
  return save({ title: "Export RyHome backup", defaultPath: `ryhome-backup-${date}.json`, filters: BACKUP_FILTER });
}

export async function pickBackupOpen(): Promise<string | null> {
  const picked = await open({ title: "Restore RyHome backup", multiple: false, directory: false, filters: BACKUP_FILTER });
  return typeof picked === "string" ? picked : null;
}

export function setTrayScenes(scenes: { id: string; name: string }[]): Promise<void> {
  return invoke("set_tray_scenes", { scenes });
}

export function quitApp(): Promise<void> {
  return invoke("quit");
}
