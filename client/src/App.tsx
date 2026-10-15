import { useCallback, useEffect, useState } from "react";
import type { RyHomeBridge } from "./api/bridge";
import type { LightAccessory, Scene } from "./api/types";
import { AddLightSheet } from "./components/AddLightSheet";
import { ControlsSheet } from "./components/ControlsSheet";
import { HomeView } from "./components/HomeView";
import type { MenuItem } from "./components/MoreMenu";
import { Onboarding } from "./components/Onboarding";
import { SceneEditor } from "./components/SceneEditor";
import { SettingsSheet } from "./components/SettingsSheet";
import { Sidebar } from "./components/Sidebar";
import { WindowControls } from "./components/WindowControls";
import type { Mode } from "./connection";
import { createBridge, loadMode, saveMode } from "./connection";
import { hideOnMinimize, isDesktop, setTrayScenes } from "./desktop";
import type { Settings } from "./settings";
import { useSettings } from "./settings";
import type { View } from "./home";
import { UnitContext } from "./home";
import { useHomeStore } from "./store";

export function App() {
  const [mode, setMode] = useState<Mode | null>(loadMode);
  const [bridge, setBridge] = useState<RyHomeBridge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [settings, updateSettings] = useSettings();

  useEffect(() => {
    if (!isDesktop || !settings.minimizeToTray) return;
    return hideOnMinimize();
  }, [settings.minimizeToTray]);

  const changeMode = useCallback((next: Mode | null) => {
    saveMode(next);
    setMode(next ?? (isDesktop ? "local" : null));
  }, []);

  useEffect(() => {
    if (!mode) return;
    let active = true;
    let created: RyHomeBridge | null = null;
    setBridge(null);
    setError(null);
    createBridge(mode).then(
      (b) => {
        created = b;
        if (active) setBridge(b);
        else b.close();
      },
      (e) => active && setError(e instanceof Error ? e.message : String(e))
    );
    return () => {
      active = false;
      created?.close();
    };
  }, [mode, attempt]);

  if (!mode) return <Onboarding onDemo={() => changeMode("demo")} />;
  if (!bridge) {
    return (
      <div className="app loading" data-tauri-drag-region>
        <WindowControls />
        {error && (
          <div className="load-error">
            <span>{error}</span>
            <div className="settings-actions">
              <button className="glass-button" onClick={() => setAttempt((n) => n + 1)}>
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <HomeApp
      key={`${mode}-${attempt}`}
      bridge={bridge}
      demo={mode === "demo"}
      settings={settings}
      onSettingsChange={updateSettings}
      onToggleDemo={() => changeMode(mode === "demo" ? null : "demo")}
    />
  );
}

function HomeApp({
  bridge,
  demo,
  settings,
  onSettingsChange,
  onToggleDemo,
}: {
  bridge: RyHomeBridge;
  demo: boolean;
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onToggleDemo: () => void;
}) {
  const store = useHomeStore(bridge);
  const [view, setView] = useState<View>({ type: "home" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null | undefined>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const closeSheet = useCallback(() => setOpenId(null), []);
  const open = store.home?.accessories.find((a) => a.id === openId);

  const sceneList = JSON.stringify(store.home?.scenes.map((s) => ({ id: s.id, name: s.name })) ?? null);
  useEffect(() => {
    if (!isDesktop || demo || sceneList === "null") return;
    setTrayScenes(JSON.parse(sceneList)).catch((e) => console.warn("Couldn't update the tray menu", e));
  }, [sceneList, demo]);

  useEffect(() => {
    if (!store.actionError) return;
    const timer = setTimeout(store.clearActionError, 5000);
    return () => clearTimeout(timer);
  }, [store.actionError]);

  const menu: MenuItem[] = [
    ...(store.capabilities?.pairing ? [{ label: "Add Light...", onSelect: () => setAdding(true) }] : []),
    ...(store.capabilities?.scenes ? [{ label: "Add Scene...", onSelect: () => setEditingScene(null) }] : []),
    { label: "Settings...", onSelect: () => setSettingsOpen(true) },
    ...(isDesktop || demo ? [{ label: demo ? "Exit Demo" : "Show Demo", onSelect: onToggleDemo, destructive: demo }] : []),
  ];

  if (!store.home) {
    return (
      <div className="app loading" data-tauri-drag-region>
        <WindowControls />
        {store.loadError && (
          <div className="load-error">
            <span>{store.loadError}</span>
            <div className="settings-actions">
              <button className="glass-button" onClick={store.retry}>
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <UnitContext.Provider value={store.home.temperatureUnit}>
      <div className="app">
        <Sidebar home={store.home} view={view} onNavigate={setView} />
        <HomeView
          home={store.home}
          view={view}
          onNavigate={setView}
          onOpen={setOpenId}
          onToggle={store.toggleLight}
          onRunScene={store.runScene}
          menu={menu}
          status={store.status}
          onEditScene={store.capabilities?.scenes ? setEditingScene : undefined}
          emptyHint={store.capabilities?.pairing ? "Choose Add Light from the ••• menu to bring in your Matter lights." : undefined}
        />
        {open && (
          <ControlsSheet
            accessory={open}
            accessories={store.home.accessories}
            rooms={store.home.rooms}
            bridge={bridge}
            canGroup={store.capabilities?.groups ?? false}
            onClose={closeSheet}
            onSetLight={(patch) => store.setLight(open.id, patch)}
            onToggleLight={store.toggleLight}
            onSetDevice={(patch) => store.setDevice(open.id, patch)}
            presets={store.home.colorPresets}
            onSavePreset={store.setColorPreset}
          />
        )}
        {editingScene !== undefined && (
          <SceneEditor
            bridge={bridge}
            lights={store.home.accessories.filter((a): a is LightAccessory => a.kind === "light")}
            rooms={store.home.rooms}
            scene={editingScene ?? undefined}
            onClose={() => setEditingScene(undefined)}
          />
        )}
        {settingsOpen && (
          <SettingsSheet
            home={store.home}
            bridge={bridge}
            canBackup={store.capabilities?.backup ?? false}
            settings={settings}
            onChange={onSettingsChange}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {adding && <AddLightSheet bridge={bridge} rooms={store.home.rooms} onClose={() => setAdding(false)} />}
        {store.actionError && (
          <div className="toast" onClick={store.clearActionError}>
            {store.actionError}
          </div>
        )}
      </div>
    </UnitContext.Provider>
  );
}
