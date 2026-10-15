import type { ConnectionStatus, RyHomeBridge } from "./bridge";
import type { Accessory, BridgeEvent, ColorPreset, GroupInput, Home, LightAccessory, LightIcon, LightState } from "./types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const defaultPresets: Omit<ColorPreset, "custom">[] = [
  { colorMode: "temperature", colorTemperature: 454, hue: 30, saturation: 50 },
  { colorMode: "temperature", colorTemperature: 370, hue: 35, saturation: 40 },
  { colorMode: "temperature", colorTemperature: 250, hue: 45, saturation: 15 },
  { colorMode: "temperature", colorTemperature: 160, hue: 210, saturation: 10 },
  { colorMode: "hs", hue: 0, saturation: 85, colorTemperature: 370 },
  { colorMode: "hs", hue: 28, saturation: 90, colorTemperature: 370 },
  { colorMode: "hs", hue: 270, saturation: 75, colorTemperature: 370 },
  { colorMode: "hs", hue: 215, saturation: 80, colorTemperature: 370 },
];

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
    colorPresets: defaultPresets.map((p) => ({ ...p, custom: false })),
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
      { id: "desk-plug", name: "Desk Plug", roomId: "office", kind: "outlet", style: "plug", on: true, brightness: null, reachable: true, matterNodeId: "desk-plug" },
      { id: "office-fan", name: "Ceiling Fan", roomId: "office", kind: "fan", on: false, speed: 40, reachable: true, matterNodeId: "office-fan" },
      { id: "front-lock", name: "Front Door Lock", roomId: "front-door", kind: "lock", locked: true, jammed: false, reachable: true, battery: 64, matterNodeId: "front-lock" },
      { id: "front-contact", name: "Front Door", roomId: "front-door", kind: "sensor", sensor: "contact", value: 1, reachable: true, battery: 90, matterNodeId: "front-contact" },
      { id: "hall-motion", name: "Hallway Motion", roomId: "living-room", kind: "sensor", sensor: "motion", value: 0, reachable: true, battery: 55, matterNodeId: "hall-motion" },
      { id: "living-shades", name: "Shades", roomId: "living-room", kind: "blind", position: 60, reachable: true, matterNodeId: "living-shades" },
      { id: "thermostat", name: "Thermostat", roomId: "living-room", kind: "thermostat", current: 21.5, target: 22, mode: "heat", reachable: true, matterNodeId: "thermostat" },
      { id: "vacuum", name: "Robot Vacuum", roomId: "living-room", kind: "other", deviceType: "Robot Vacuum", reachable: true, matterNodeId: "vacuum" },
    ],
    scenes: [
      { id: "scene-arrive", name: "Arrive Home", type: "arrival", actions: [] },
      { id: "scene-leave", name: "Leave Home", type: "departure", actions: [] },
      { id: "scene-morning", name: "Good Morning", type: "wakeUp", actions: [] },
      { id: "scene-night", name: "Good Night", type: "sleep", actions: [] },
    ],
  };
}

interface MockGroup {
  id: string;
  name: string;
  roomId: string;
  icon: LightIcon;
  members: string[];
}

export function createMockBridge(): RyHomeBridge {
  const home = seed();
  const listeners = new Set<(event: BridgeEvent) => void>();
  const broadcast = (event: BridgeEvent) => listeners.forEach((l) => l(event));
  const emit = (accessory: Accessory) => broadcast({ type: "accessoryUpdated", accessory });
  const timers: number[] = [];
  let groups: MockGroup[] = [
    { id: "group-tall", name: "Tall Lamp", roomId: "living-room", icon: "floorLamp", members: ["tall-top", "tall-middle", "tall-bottom"] },
  ];
  let nextNode = 100;
  let nextGroup = 1;

  const roomFor = (name: string | undefined, fallback: string) => {
    if (!name) return fallback;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (!home.rooms.some((r) => r.id === id)) home.rooms.push({ id, name });
    return id;
  };
  const lights = () => home.accessories.filter((a): a is LightAccessory => a.kind === "light" && !a.members);

  const sync = () => {
    groups = groups.filter((g) => g.members.length > 1);
    const plain = home.accessories.filter((a) => !(a.kind === "light" && a.members));
    for (const a of plain) if (a.kind === "light") a.groupId = groups.find((g) => g.members.includes(a.id))?.id;
    const built = groups.map((g): LightAccessory => {
      const members = plain.filter((a): a is LightAccessory => a.kind === "light" && g.members.includes(a.id));
      const lit = members.filter((m) => m.state.on);
      const pool = lit.length ? lit : members;
      return {
        ...light(g.id, g.name, g.roomId, g.icon),
        matterNodeId: undefined,
        members: members.map((m) => m.id),
        state: {
          ...(lit[0] ?? members[0]).state,
          on: lit.length > 0,
          brightness: Math.round(pool.reduce((s, m) => s + m.state.brightness, 0) / pool.length),
        },
      };
    });
    home.accessories = [...plain, ...built];
  };
  sync();

  const saveGroup = (id: string, input: Partial<GroupInput>) => {
    const existing = groups.find((g) => g.id === id);
    const group: MockGroup = {
      id,
      name: input.name ?? existing?.name ?? "Group",
      roomId: input.room ? roomFor(input.room, "living-room") : existing?.roomId ?? "living-room",
      icon: input.icon ?? existing?.icon ?? "bulb",
      members: input.members ?? existing?.members ?? [],
    };
    for (const g of groups) if (g.id !== id) g.members = g.members.filter((m) => !group.members.includes(m));
    groups = [...groups.filter((g) => g.id !== id), group];
    sync();
    broadcast({ type: "homeChanged" });
  };

  timers.push(
    window.setInterval(() => {
      const sensor = home.accessories.find((a) => a.id === "temperature");
      if (sensor?.kind !== "sensor") return;
      sensor.value = Math.round((sensor.value + (Math.random() - 0.5) * 0.4) * 10) / 10;
      emit({ ...sensor });
    }, 15000)
  );

  return {
    async getCapabilities() {
      return { lights: true, scenes: true, pairing: true, rename: true, groups: true, backup: false };
    },
    async getHome() {
      await wait(150);
      return structuredClone(home);
    },
    async updateHome(patch) {
      if (patch.name) home.name = patch.name;
      if (patch.temperatureUnit) home.temperatureUnit = patch.temperatureUnit;
      broadcast({ type: "homeChanged" });
    },
    async setColorPresets(presets) {
      home.colorPresets = presets.map((p, i) => (p ? { ...p, custom: true } : { ...defaultPresets[i], custom: false }));
      broadcast({ type: "homeChanged" });
    },
    async commission(code, details) {
      await wait(1800);
      if (code.replace(/\D/g, "").length !== 11) throw new Error("That isn't a valid Matter pairing code. Use the 11-digit setup code from the Home app.");
      const nodeId = String(nextNode++);
      const accessory: LightAccessory = {
        ...light(`matter-${nodeId}-1`, details.name ?? "Govee Bulb", roomFor(details.room, "office"), details.icon ?? "bulb", { on: true }),
        matterNodeId: nodeId,
      };
      home.accessories.push(accessory);
      sync();
      broadcast({ type: "homeChanged" });
      return { nodeId, accessories: [structuredClone(accessory)] };
    },
    async updateAccessory(accessoryId, details) {
      const group = groups.find((g) => g.id === accessoryId);
      if (group) return saveGroup(group.id, details);
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
    async createGroup(input) {
      saveGroup(`group-demo-${nextGroup++}`, input);
    },
    async updateGroup(groupId, input) {
      saveGroup(groupId, input);
    },
    async deleteGroup(groupId) {
      groups = groups.filter((g) => g.id !== groupId);
      sync();
      broadcast({ type: "homeChanged" });
    },
    async exportBackup() {
      throw new Error("Backups aren't available in the demo.");
    },
    async restoreBackup() {
      throw new Error("Backups aren't available in the demo.");
    },
    async forgetNode(nodeId) {
      return this.removeNode(nodeId);
    },
    async removeNode(nodeId) {
      home.accessories = home.accessories.filter((a) => !(a.kind === "light" && a.matterNodeId === nodeId));
      for (const g of groups) g.members = g.members.filter((m) => home.accessories.some((a) => a.id === m));
      sync();
      broadcast({ type: "homeChanged" });
    },
    async setLight(accessoryId, patch) {
      const group = groups.find((g) => g.id === accessoryId);
      const targets = group ? group.members : [accessoryId];
      for (const target of targets) {
        const accessory = lights().find((a) => a.id === target);
        if (!accessory) throw new Error("Not a light");
        accessory.state = { ...accessory.state, ...patch };
      }
      sync();
      for (const a of home.accessories) {
        if (a.kind === "light" && (targets.includes(a.id) || a.members?.some((m) => targets.includes(m)))) emit(structuredClone(a));
      }
    },
    async setState(accessoryId, patch) {
      await wait(150);
      home.accessories = home.accessories.map((a) => {
        if (a.id !== accessoryId) return a;
        if ((a.kind === "outlet" || a.kind === "fan") && patch.on !== undefined) return { ...a, on: patch.on };
        if (a.kind === "fan" && patch.speed !== undefined) return { ...a, on: patch.speed > 0, speed: patch.speed };
        if (a.kind === "lock" && patch.locked !== undefined) return { ...a, locked: patch.locked };
        if (a.kind === "blind" && patch.position !== undefined) return { ...a, position: patch.position };
        if (a.kind === "thermostat" && patch.targetDelta !== undefined && a.target !== null) return { ...a, target: a.target + patch.targetDelta };
        return a;
      });
      const updated = home.accessories.find((a) => a.id === accessoryId);
      if (updated) emit(structuredClone(updated));
    },
    async runScene(sceneId) {
      const scene = home.scenes.find((s) => s.id === sceneId);
      if (!scene) throw new Error("Unknown scene");
      if (scene.actions.length === 0) {
        const on = scene.type === "arrival" || scene.type === "wakeUp";
        for (const a of lights()) a.state = { ...a.state, on };
      }
      for (const action of scene.actions) {
        const group = groups.find((g) => g.id === action.accessoryId);
        for (const id of group ? group.members : [action.accessoryId]) {
          const target = lights().find((a) => a.id === id);
          if (target) target.state = { ...target.state, ...action.state };
        }
      }
      sync();
      home.accessories.forEach((a) => a.kind === "light" && emit(structuredClone(a)));
    },
    async createScene(scene) {
      home.scenes.push({ ...scene, id: `scene-demo-${Date.now()}` });
      broadcast({ type: "homeChanged" });
    },
    async updateScene(sceneId, scene) {
      home.scenes = home.scenes.map((s) => (s.id === sceneId ? { ...scene, id: sceneId } : s));
      broadcast({ type: "homeChanged" });
    },
    async deleteScene(sceneId) {
      home.scenes = home.scenes.filter((s) => s.id !== sceneId);
      broadcast({ type: "homeChanged" });
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
