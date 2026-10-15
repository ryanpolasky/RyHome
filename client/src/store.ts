import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionStatus, RyHomeBridge } from "./api/bridge";
import type { Accessory, Capabilities, DeviceStatePatch, Home, LightState, PresetInput } from "./api/types";

const LIGHT_THROTTLE_MS = 80;
const HOLD_MS = 4000;
const TOLERANCE: Partial<Record<keyof LightState, number>> = { brightness: 1, saturation: 2, hue: 3, colorTemperature: 5 };

type Hold = { patch: Partial<LightState>; until: number };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function replaceAccessory(home: Home, accessory: Accessory): Home {
  return {
    ...home,
    accessories: home.accessories.map((a) => (a.id === accessory.id ? accessory : a)),
  };
}

function settled(state: LightState, patch: Partial<LightState>): boolean {
  if (patch.on === false) return !state.on;
  return (Object.keys(patch) as (keyof LightState)[]).every((key) => {
    const want = patch[key];
    const have = state[key];
    return typeof want === "number" && typeof have === "number" ? Math.abs(want - have) <= (TOLERANCE[key] ?? 0) : want === have;
  });
}

export function useHomeStore(bridge: RyHomeBridge) {
  const [home, setHome] = useState<Home | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const pending = useRef(new Map<string, { patch: Partial<LightState>; timer: number | null; last: number }>());
  const holds = useRef(new Map<string, Hold>());

  // lights report their old values for a beat after a change, so keep showing what the user set until they catch up
  const withHolds = useCallback((accessory: Accessory): Accessory => {
    if (accessory.kind !== "light") return accessory;
    const hold = holds.current.get(accessory.id);
    if (!hold) return accessory;
    if (Date.now() > hold.until || settled(accessory.state, hold.patch)) {
      holds.current.delete(accessory.id);
      return accessory;
    }
    return { ...accessory, state: { ...accessory.state, ...hold.patch } };
  }, []);

  const load = useCallback(() => {
    setLoadError(null);
    Promise.all([bridge.getHome(), bridge.getCapabilities()]).then(
      ([h, c]) => {
        setHome({ ...h, accessories: h.accessories.map(withHolds) });
        setCapabilities(c);
      },
      (e) => setLoadError(errorMessage(e))
    );
  }, [bridge, withHolds]);

  useEffect(() => {
    load();
    const unsubscribe = bridge.subscribe((event) => {
      if (event.type === "homeChanged") {
        load();
        return;
      }
      setHome((h) => (h ? replaceAccessory(h, withHolds(event.accessory)) : h));
    });
    const unstatus = bridge.onStatus(setStatus);
    return () => {
      unsubscribe();
      unstatus();
    };
  }, [bridge, load, withHolds]);

  const fail = useCallback(
    (id: string, e: unknown) => {
      holds.current.delete(id);
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
      bridge.setLight(id, patch).catch((e) => fail(id, e));
    },
    [bridge, fail]
  );

  const setLight = useCallback(
    (id: string, patch: Partial<LightState>) => {
      const previous = holds.current.get(id)?.patch ?? {};
      holds.current.set(id, { patch: patch.on === false ? { on: false } : { ...previous, ...patch }, until: Date.now() + HOLD_MS });
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

  // applies a device change right away so the tile responds before the device confirms
  const setDevice = useCallback(
    (id: string, patch: DeviceStatePatch) => {
      setHome((h) => {
        if (!h) return h;
        const a = h.accessories.find((x) => x.id === id);
        if (!a) return h;
        let next: Accessory = a;
        if ((a.kind === "outlet" || a.kind === "fan") && patch.on !== undefined) next = { ...a, on: patch.on };
        if (a.kind === "outlet" && patch.brightness !== undefined) next = { ...a, on: true, brightness: patch.brightness };
        if (a.kind === "fan" && patch.speed !== undefined) next = { ...a, on: patch.speed > 0, speed: patch.speed };
        if (a.kind === "lock" && patch.locked !== undefined) next = { ...a, locked: patch.locked };
        if (a.kind === "blind" && patch.position !== undefined) next = { ...a, position: patch.position };
        if (a.kind === "thermostat" && patch.targetDelta !== undefined && a.target !== null) next = { ...a, target: a.target + patch.targetDelta };
        return replaceAccessory(h, next);
      });
      bridge.setState(id, patch).catch((e) => fail(id, e));
    },
    [bridge, fail]
  );

  const toggleLight = useCallback(
    (id: string) => {
      const a = home?.accessories.find((x) => x.id === id);
      if (!a || !a.reachable) return;
      if (a.kind === "light") setLight(id, { on: !a.state.on });
      if (a.kind === "outlet" || a.kind === "fan") setDevice(id, { on: !a.on });
      if (a.kind === "lock") setDevice(id, { locked: a.locked === false });
      if (a.kind === "blind") setDevice(id, { position: (a.position ?? 0) > 0 ? 0 : 100 });
    },
    [home, setLight, setDevice]
  );

  // null resets a slot to its default; the engine fills defaults back in on reload
  const setColorPreset = useCallback(
    (index: number, preset: PresetInput) => {
      if (!home) return;
      const next = home.colorPresets.map((p, i): PresetInput => {
        if (i === index) return preset;
        return p.custom ? { colorMode: p.colorMode, hue: p.hue, saturation: p.saturation, colorTemperature: p.colorTemperature } : null;
      });
      if (preset) {
        setHome((h) => h && { ...h, colorPresets: h.colorPresets.map((p, i) => (i === index ? { ...preset, custom: true } : p)) });
      }
      bridge.setColorPresets(next).catch((e) => {
        setActionError(errorMessage(e));
        load();
      });
    },
    [bridge, home, load]
  );

  const runScene = useCallback(
    (id: string) => bridge.runScene(id).catch((e) => fail(id, e)),
    [bridge, fail]
  );

  return {
    home,
    capabilities,
    loadError,
    actionError,
    clearActionError: () => setActionError(null),
    status,
    retry: load,
    setLight,
    setDevice,
    toggleLight,
    runScene,
    setColorPreset,
  };
}
