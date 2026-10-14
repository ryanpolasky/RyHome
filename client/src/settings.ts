import { useEffect, useState } from "react";

export interface Settings {
  minimizeToTray: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  minimizeToTray: false,
};

const SETTINGS_KEY = "ryhome.settings";

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(loadSettings);
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);
  return [settings, (patch) => setSettings((prev) => ({ ...prev, ...patch }))];
}
