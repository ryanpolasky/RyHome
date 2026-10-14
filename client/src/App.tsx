import { useCallback, useEffect, useState } from "react";
import type { RyHomeBridge } from "./api/bridge";
import { AddLightSheet } from "./components/AddLightSheet";
import { ControlsSheet } from "./components/ControlsSheet";
import { HomeView } from "./components/HomeView";
import type { MenuItem } from "./components/MoreMenu";
import { Onboarding } from "./components/Onboarding";
import { Sidebar } from "./components/Sidebar";
import { WindowControls } from "./components/WindowControls";
import type { Mode } from "./connection";
import { createBridge, loadMode, saveMode } from "./connection";
import { isDesktop } from "./desktop";
import type { View } from "./home";
import { UnitContext } from "./home";
import { useHomeStore } from "./store";

export function App() {
  const [mode, setMode] = useState<Mode | null>(loadMode);
  const [bridge, setBridge] = useState<RyHomeBridge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
      onToggleDemo={() => changeMode(mode === "demo" ? null : "demo")}
    />
  );
}

function HomeApp({ bridge, demo, onToggleDemo }: { bridge: RyHomeBridge; demo: boolean; onToggleDemo: () => void }) {
  const store = useHomeStore(bridge);
  const [view, setView] = useState<View>({ type: "home" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const closeSheet = useCallback(() => setOpenId(null), []);
  const open = store.home?.accessories.find((a) => a.id === openId);

  useEffect(() => {
    if (!store.actionError) return;
    const timer = setTimeout(store.clearActionError, 5000);
    return () => clearTimeout(timer);
  }, [store.actionError]);

  const menu: MenuItem[] = [
    ...(store.capabilities?.pairing ? [{ label: "Add Light...", onSelect: () => setAdding(true) }] : []),
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
          emptyHint={store.capabilities?.pairing ? "Choose Add Light from the ••• menu to bring in your Matter lights." : undefined}
        />
        {open && (
          <ControlsSheet
            accessory={open}
            rooms={store.home.rooms}
            bridge={bridge}
            onClose={closeSheet}
            onSetLight={(patch) => store.setLight(open.id, patch)}
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
