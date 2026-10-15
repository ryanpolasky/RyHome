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
  matterNodeId?: string;
  battery?: number | null;
}

export interface LightAccessory extends AccessoryBase {
  kind: "light";
  members?: string[];
  groupId?: string;
  icon: LightIcon;
  supports: LightSupport;
  state: LightState;
}

export interface OutletAccessory extends AccessoryBase {
  kind: "outlet";
  style: "plug" | "switch";
  on: boolean;
  brightness: number | null;
}

export type SensorType = "temperature" | "humidity" | "motion" | "contact" | "leak" | "illuminance";

export interface SensorAccessory extends AccessoryBase {
  kind: "sensor";
  sensor: SensorType;
  value: number;
}

export interface LockAccessory extends AccessoryBase {
  kind: "lock";
  locked: boolean | null;
  jammed: boolean;
}

export interface BlindAccessory extends AccessoryBase {
  kind: "blind";
  position: number | null;
}

export interface FanAccessory extends AccessoryBase {
  kind: "fan";
  on: boolean;
  speed: number | null;
}

export interface ThermostatAccessory extends AccessoryBase {
  kind: "thermostat";
  current: number | null;
  target: number | null;
  mode: "off" | "heat" | "cool" | "auto" | "other";
}

export interface OtherAccessory extends AccessoryBase {
  kind: "other";
  deviceType: string;
}

export type Accessory =
  | LightAccessory
  | OutletAccessory
  | SensorAccessory
  | LockAccessory
  | BlindAccessory
  | FanAccessory
  | ThermostatAccessory
  | OtherAccessory;

export interface DeviceStatePatch {
  on?: boolean;
  brightness?: number;
  locked?: boolean;
  position?: number;
  stop?: boolean;
  speed?: number;
  targetDelta?: number;
}

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

export interface ColorPreset {
  colorMode: "hs" | "temperature";
  hue: number;
  saturation: number;
  colorTemperature: number;
  custom: boolean;
}

export interface Home {
  id: string;
  name: string;
  temperatureUnit: "C" | "F";
  colorPresets: ColorPreset[];
  rooms: Room[];
  accessories: Accessory[];
  scenes: Scene[];
}

export type BridgeEvent = { type: "accessoryUpdated"; accessory: Accessory } | { type: "homeChanged" };

export interface Capabilities {
  lights: boolean;
  scenes: boolean;
  pairing: boolean;
  rename: boolean;
  groups: boolean;
  backup: boolean;
}
