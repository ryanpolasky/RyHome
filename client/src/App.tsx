import { useCallback, useEffect, useMemo, useState } from "react";
import { AddLightSheet } from "./components/AddLightSheet";
import { ControlsSheet } from "./components/ControlsSheet";
import { HomeView } from "./components/HomeView";
import type { MenuItem } from "./components/MoreMenu";
import { Onboarding } from "./components/Onboarding";
import { Sidebar } from "./components/Sidebar";
import { WindowControls } from "./components/WindowControls";
import type { Connection } from "./connection";
import { clearConnection, createBridge, loadConnection } from "./connection";
import type { View } from "./home";
import { UnitContext } from "./home";
import { useHomeStore } from "./store";

export function App() {
  const [connection, setConnection] = useState<Connection | null>(loadConnection);
  if (!connection) return <Onboarding onConnected={setConnection} />;
  return (
    <HomeApp
      key={connection.mode === "demo" ? "demo" : connection.url}
      connection={connection}
      onDisconnect={() => {
        clearConnection();
        setConnection(null);
      }}
    />
  );
}

function HomeApp({ connection, onDisconnect }: { connection: Connection; onDisconnect: () => void }) {
  const bridge = useMemo(() => createBridge(connection), [connection]);
  useEffect(() => () => bridge.close(), [bridge]);
  const store = useHomeStore(bridge);
  const [view, setView] = useState<View>({ type: "home" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const closeSheet = useCallback(() => setOpenId(null), []);
  const open = store.home?.accessories.find((a) => a.id === openId);
  const demo = connection.mode === "demo";

  useEffect(() => {
    if (!store.actionError) return;
    const timer = setTimeout(store.clearActionError, 5000);
    return () => clearTimeout(timer);
  }, [store.actionError]);

  const menu: MenuItem[] = [
    ...(store.capabilities?.pairing ? [{ label: "Add Light...", onSelect: () => setAdding(true) }] : []),
    { label: demo ? "Exit Demo" : "Disconnect", onSelect: onDisconnect, destructive: true },
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
              <button className="glass-button" onClick={onDisconnect}>
                {demo ? "Exit Demo" : "Disconnect"}
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
          emptyHint={store.capabilities?.pairing ? "Choose Add Light from the ••• menu to bring in lights from the Home app." : undefined}
        />
        {open && (
          <ControlsSheet
            accessory={open}
            bridge={bridge}
            onClose={closeSheet}
            onSetLight={(patch) => store.setLight(open.id, patch)}
          />
        )}
        {adding && <AddLightSheet bridge={bridge} onClose={() => setAdding(false)} />}
        {store.actionError && (
          <div className="toast" onClick={store.clearActionError}>
            {store.actionError}
          </div>
        )}
      </div>
    </UnitContext.Provider>
  );
}
