export interface Room {
  id: string;
  name: string;
}

export type LightIcon = "bulb" | "ceiling" | "floorLamp" | "tableLamp" | "lightstrip";

export interface LightState {
  on: boolean;
  brightness: number;
  hue: number;
  saturation: number;
  colorTemperature: number;
  colorMode: "hs" | "temperature";
}

export interface LightSupport {
  brightness: boolean;
  color: boolean;
  temperature: boolean;
}

interface AccessoryBase {
  id: string;
  name: string;
  roomId: string;
  reachable: boolean;
}

export interface LightAccessory extends AccessoryBase {
  kind: "light";
  matterNodeId?: string;
  members?: string[];
  groupId?: string;
  icon: LightIcon;
  supports: LightSupport;
  state: LightState;
}

export interface CameraAccessory extends AccessoryBase {
  kind: "camera";
  doorbell: boolean;
  motion: boolean;
  batteryLevel: number | null;
  snapshotUrl: string | null;
}

export interface MediaAccessory extends AccessoryBase {
  kind: "television" | "speaker";
  playing: boolean;
  nowPlaying: string | null;
}

export interface SensorAccessory extends AccessoryBase {
  kind: "sensor";
  sensor: "temperature" | "humidity";
  value: number;
}

export type Accessory = LightAccessory | CameraAccessory | MediaAccessory | SensorAccessory;

export interface SceneAction {
  accessoryId: string;
  state: Partial<LightState>;
}

export interface Scene {
  id: string;
  name: string;
  type: "wakeUp" | "sleep" | "departure" | "arrival" | "custom";
  actions: SceneAction[];
}

export interface Home {
  id: string;
  name: string;
  temperatureUnit: "C" | "F";
  rooms: Room[];
  accessories: Accessory[];
  scenes: Scene[];
}

export interface Capabilities {
  lights: boolean;
  scenes: boolean;
  pairing: boolean;
  rename: boolean;
  groups: boolean;
}

export interface GroupInput {
  name: string;
  room?: string;
  icon?: LightIcon;
  members: string[];
}

export interface AccessoryDetails {
  name?: string;
  room?: string;
  icon?: LightIcon;
}

export type BridgeEvent = { type: "accessoryUpdated"; accessory: Accessory } | { type: "homeChanged" };
