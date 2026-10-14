import type { ConnectionStatus, RyHomeBridge } from "./bridge";
import type { Accessory, BridgeEvent, Home, LightAccessory, LightIcon, LightState } from "./types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function light(
  id: string,
  name: string,
  roomId: string,
  icon: LightIcon,
  state: Partial<LightState> = {}
): LightAccessory {
  return {
    id,
    name,
    roomId,
    kind: "light",
    icon,
    reachable: true,
    matterNodeId: id,
    supports: { brightness: true, color: true, temperature: true },
    state: {
      on: false,
      brightness: 100,
      hue: 35,
      saturation: 40,
      colorTemperature: 370,
      colorMode: "temperature",
      ...state,
    },
  };
}

function seed(): Home {
  return {
    id: "home",
    name: "Home",
    temperatureUnit: "F",
    rooms: [
      { id: "front-door", name: "Front Door" },
      { id: "living-room", name: "Living Room" },
      { id: "office", name: "Office" },
    ],
    accessories: [
      {
        id: "doorbell",
        name: "Doorbell",
        roomId: "front-door",
        kind: "camera",
        doorbell: true,
        motion: false,
        batteryLevel: 82,
        snapshotUrl: null,
        reachable: true,
      },
      light("tv-backlight", "Main TV Backlight", "living-room", "lightstrip", {
        on: true,
        brightness: 60,
        hue: 270,
        saturation: 75,
        colorMode: "hs",
      }),
      light("record-lamp", "Record Lamp", "living-room", "tableLamp", { on: true, brightness: 45 }),
      light("shelf-lamp", "Shelf Lamp", "living-room", "tableLamp"),
      light("tall-top", "Tall Lamp Top", "living-room", "floorLamp", { on: true, brightness: 80 }),
      light("tall-middle", "Tall Lamp Middle", "living-room", "floorLamp", { on: true, brightness: 80 }),
      light("tall-bottom", "Tall Lamp Bottom", "living-room", "floorLamp", { on: true, brightness: 80 }),
      {
        id: "apple-tv",
        name: "Apple TV",
        roomId: "living-room",
        kind: "television",
        playing: false,
        nowPlaying: null,
        reachable: true,
      },
      {
        id: "homepod-mini",
        name: "HomePod mini",
        roomId: "living-room",
        kind: "speaker",
        playing: true,
        nowPlaying: "Jazz Vibes",
        reachable: true,
      },
      {
        id: "temperature",
        name: "Temperature",
        roomId: "living-room",
        kind: "sensor",
        sensor: "temperature",
        value: 22.4,
        reachable: true,
      },
      {
        id: "humidity",
        name: "Humidity",
        roomId: "living-room",
        kind: "sensor",
        sensor: "humidity",
        value: 41,
        reachable: true,
      },
      light("office-desk", "Office Desk Bulb", "office", "ceiling", { on: true, brightness: 100 }),
      light("office-door", "Office Door Bulb", "office", "ceiling"),
      light("office-middle", "Office Middle Bulb", "office", "ceiling", {
        on: true,
        brightness: 70,
        hue: 200,
        saturation: 60,
        colorMode: "hs",
      }),
    ],
    scenes: [
      { id: "scene-arrive", name: "Arrive Home", type: "arrival", actions: [] },
      { id: "scene-leave", name: "Leave Home", type: "departure", actions: [] },
      { id: "scene-morning", name: "Good Morning", type: "wakeUp", actions: [] },
      { id: "scene-night", name: "Good Night", type: "sleep", actions: [] },
    ],
  };
}

export function createMockBridge(): RyHomeBridge {
  const home = seed();
  const listeners = new Set<(event: BridgeEvent) => void>();
  const broadcast = (event: BridgeEvent) => listeners.forEach((l) => l(event));
  const emit = (accessory: Accessory) => broadcast({ type: "accessoryUpdated", accessory });
  const timers: number[] = [];
  const roomFor = (name: string | undefined, fallback: string) => {
    if (!name) return fallback;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (!home.rooms.some((r) => r.id === id)) home.rooms.push({ id, name });
    return id;
  };

  timers.push(
    window.setInterval(() => {
      const sensor = home.accessories.find((a) => a.id === "temperature");
      if (sensor?.kind !== "sensor") return;
      sensor.value = Math.round((sensor.value + (Math.random() - 0.5) * 0.4) * 10) / 10;
      emit({ ...sensor });
    }, 15000)
  );

  let nextNode = 100;

  return {
    async getCapabilities() {
      return { lights: true, scenes: true, pairing: true, rename: true };
    },
    async getHome() {
      await wait(150);
      return structuredClone(home);
    },
    async commission(code, details) {
      await wait(1800);
      if (code.replace(/D/g, "").length !== 11) throw new Error("That isn't a valid Matter pairing code. Use the 11-digit setup code from the Home app.");
      const nodeId = String(nextNode++);
      const accessory: LightAccessory = {
        ...light(`matter-${nodeId}-1`, details.name ?? "Govee Bulb", roomFor(details.room, "office"), details.icon ?? "bulb", { on: true }),
        matterNodeId: nodeId,
      };
      home.accessories.push(accessory);
      broadcast({ type: "homeChanged" });
      return { nodeId, accessories: [structuredClone(accessory)] };
    },
    async updateAccessory(accessoryId, details) {
      home.accessories = home.accessories.map((a) =>
        a.id !== accessoryId
          ? a
          : {
              ...a,
              name: details.name ?? a.name,
              roomId: roomFor(details.room, a.roomId),
              ...(a.kind === "light" && details.icon ? { icon: details.icon } : {}),
            }
      );
      broadcast({ type: "homeChanged" });
    },
    async removeNode(nodeId) {
      home.accessories = home.accessories.filter((a) => !(a.kind === "light" && a.matterNodeId === nodeId));
      broadcast({ type: "homeChanged" });
    },
    async setLight(accessoryId, patch) {
      const index = home.accessories.findIndex((a) => a.id === accessoryId);
      const accessory = home.accessories[index];
      if (accessory?.kind !== "light") throw new Error("Not a light");
      const next = { ...accessory, state: { ...accessory.state, ...patch } };
      home.accessories[index] = next;
      emit(structuredClone(next));
    },
    async runScene(sceneId) {
      const scene = home.scenes.find((s) => s.id === sceneId);
      if (!scene) throw new Error("Unknown scene");
      const on = scene.type === "arrival" || scene.type === "wakeUp";
      home.accessories = home.accessories.map((a) => {
        if (a.kind !== "light") return a;
        const next = { ...a, state: { ...a.state, on } };
        emit(structuredClone(next));
        return next;
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onStatus(listener: (status: ConnectionStatus) => void) {
      listener("online");
      return () => {};
    },
    close() {
      timers.forEach(clearInterval);
      listeners.clear();
    },
  };
}
