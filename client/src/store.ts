import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionStatus, RyHomeBridge } from "./api/bridge";
import type { Accessory, Capabilities, Home, LightState } from "./api/types";

const LIGHT_THROTTLE_MS = 80;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function replaceAccessory(home: Home, accessory: Accessory): Home {
  return {
    ...home,
    accessories: home.accessories.map((a) => (a.id === accessory.id ? accessory : a)),
  };
}

export function useHomeStore(bridge: RyHomeBridge) {
  const [home, setHome] = useState<Home | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const pending = useRef(new Map<string, { patch: Partial<LightState>; timer: number | null; last: number }>());

  const load = useCallback(() => {
    setLoadError(null);
    Promise.all([bridge.getHome(), bridge.getCapabilities()]).then(
      ([h, c]) => {
        setHome(h);
        setCapabilities(c);
      },
      (e) => setLoadError(errorMessage(e))
    );
  }, [bridge]);

  useEffect(() => {
    load();
    const unsubscribe = bridge.subscribe((event) => {
      if (event.type === "homeChanged") {
        load();
        return;
      }
      // skip echoes while a drag is still sending so the slider doesn't jump back
      if (pending.current.get(event.accessory.id)?.timer != null) return;
      setHome((h) => (h ? replaceAccessory(h, event.accessory) : h));
    });
    const unstatus = bridge.onStatus(setStatus);
    return () => {
      unsubscribe();
      unstatus();
    };
  }, [bridge, load]);

  const fail = useCallback(
    (e: unknown) => {
      setActionError(errorMessage(e));
      load();
    },
    [load]
  );

  const flush = useCallback(
    (id: string) => {
      const entry = pending.current.get(id);
      if (!entry) return;
      const patch = entry.patch;
      entry.patch = {};
      entry.timer = null;
      entry.last = Date.now();
      bridge.setLight(id, patch).catch(fail);
    },
    [bridge, fail]
  );

  const setLight = useCallback(
    (id: string, patch: Partial<LightState>) => {
      setHome((h) => {
        if (!h) return h;
        const accessory = h.accessories.find((a) => a.id === id);
        if (accessory?.kind !== "light") return h;
        return replaceAccessory(h, { ...accessory, state: { ...accessory.state, ...patch } });
      });
      const entry = pending.current.get(id) ?? { patch: {}, timer: null, last: 0 };
      pending.current.set(id, entry);
      entry.patch = { ...entry.patch, ...patch };
      if (entry.timer != null) return;
      const wait = Math.max(0, entry.last + LIGHT_THROTTLE_MS - Date.now());
      if (wait === 0) flush(id);
      else entry.timer = window.setTimeout(() => flush(id), wait);
    },
    [flush]
  );

  const toggleLight = useCallback(
    (id: string) => {
      const accessory = home?.accessories.find((a) => a.id === id);
      if (accessory?.kind !== "light" || !accessory.reachable) return;
      setLight(id, { on: !accessory.state.on });
    },
    [home, setLight]
  );

  const runScene = useCallback((id: string) => bridge.runScene(id).catch(fail), [bridge, fail]);

  return {
    home,
    capabilities,
    loadError,
    actionError,
    clearActionError: () => setActionError(null),
    status,
    retry: load,
    setLight,
    toggleLight,
    runScene,
  };
}
