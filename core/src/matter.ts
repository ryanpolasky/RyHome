import { join } from "node:path";
import { Environment, Logger, type Endpoint } from "@matter/main";
import { GeneralCommissioning } from "@matter/main/clusters";
import { ManualPairingCodeCodec, NodeId, QrPairingCodeCodec } from "@matter/main/types";
import { CommissioningController, type NodeCommissioningOptions } from "@project-chip/matter.js";
import { NodeStates, type PairedNode } from "@project-chip/matter.js/device";
import { hsToXy, xyToHs } from "./color.js";
import { dataDir } from "./config.js";
import type { Accessory, DeviceStatePatch, LightState, LightSupport, SensorType, ThermostatAccessory } from "./types.js";

type Struct = Record<string, unknown>;

const LEVEL_MAX = 254;
const HUE_MAX = 254;
const XY_SCALE = 65536;
const EXECUTE_IF_OFF = { optionsMask: { executeIfOff: true }, optionsOverride: { executeIfOff: true } };

function stateOf(ep: Endpoint, behavior: string): Struct | undefined {
  return ep.behaviors.has(behavior) ? (ep.maybeStateOf(behavior) as unknown as Struct | undefined) : undefined;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function* walk(parts: Iterable<Endpoint>): Generator<Endpoint> {
  for (const ep of parts) {
    yield ep;
    yield* walk(ep.parts);
  }
}

export function parsePairingCode(code: string): { passcode: number; identifierData: { shortDiscriminator: number } | { longDiscriminator: number } } {
  const trimmed = code.trim();
  try {
    if (/^MT:/i.test(trimmed)) {
      const [data] = QrPairingCodeCodec.decode(trimmed.toUpperCase());
      return { passcode: data.passcode, identifierData: { longDiscriminator: data.discriminator } };
    }
    const data = ManualPairingCodeCodec.decode(trimmed);
    if (data.shortDiscriminator !== undefined) {
      return { passcode: data.passcode, identifierData: { shortDiscriminator: data.shortDiscriminator } };
    }
  } catch {}
  throw new Error("That isn't a valid Matter pairing code. Use the 11-digit setup code from the Home app.");
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type MatterDevice = DistributiveOmit<Accessory, "name" | "roomId" | "matterNodeId" | "members" | "groupId"> & {
  nodeId: string;
  fallbackName: string;
};

export type MatterLight = Extract<MatterDevice, { kind: "light" }>;

const LIGHT_TYPES = new Set([0x0100, 0x0101, 0x010c, 0x010d]);
const PLUG_TYPES = new Set([0x010a, 0x010b]);
const WALL_SWITCH_TYPES = new Set([0x010f, 0x0110]);
const SENSOR_TYPES: Record<number, SensorType> = {
  0x0302: "temperature",
  0x0307: "humidity",
  0x0107: "motion",
  0x0015: "contact",
  0x0043: "leak",
  0x0106: "illuminance",
};
// buttons, roots, bridges and power sources aren't things you control, so they never get a tile
const SKIP_TYPES = new Set([0x0016, 0x000e, 0x0013, 0x0011, 0x0012, 0x0014, 0x0103, 0x0104, 0x0105, 0x000f, 0x0510, 0x050c, 0x0024]);
const KNOWN_NAMES: Record<number, string> = {
  0x0028: "TV",
  0x0022: "Speaker",
  0x002d: "Air Purifier",
  0x0074: "Robot Vacuum",
  0x002c: "Air Quality Sensor",
  0x0076: "Smoke Alarm",
  0x0050: "Dishwasher",
  0x0073: "Washer",
  0x0042: "Valve",
  0x0072: "Air Conditioner",
};

function deviceTypes(ep: Endpoint): number[] {
  const list = stateOf(ep, "descriptor")?.deviceTypeList;
  return Array.isArray(list) ? list.map((d) => num((d as Struct).deviceType, -1)) : [];
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function battery(ep: Endpoint, root: Endpoint | undefined): number | null {
  for (const source of [ep, root]) {
    const raw = source && stateOf(source, "powerSource")?.batPercentRemaining;
    if (typeof raw === "number") return Math.round(raw / 2);
  }
  return null;
}

function classify(ep: Endpoint): { kind: MatterDevice["kind"]; type: number; sensor?: SensorType; style?: "plug" | "switch" } | null {
  const types = deviceTypes(ep);
  for (const type of types) {
    if (LIGHT_TYPES.has(type)) return { kind: "light", type };
    if (PLUG_TYPES.has(type)) return { kind: "outlet", type, style: "plug" };
    if (WALL_SWITCH_TYPES.has(type)) return { kind: "outlet", type, style: "switch" };
    if (type === 0x000a) return { kind: "lock", type };
    if (type === 0x0202) return { kind: "blind", type };
    if (type === 0x002b) return { kind: "fan", type };
    if (type === 0x0301) return { kind: "thermostat", type };
    if (SENSOR_TYPES[type]) return { kind: "sensor", type, sensor: SENSOR_TYPES[type] };
  }
  const meaningful = types.filter((t) => !SKIP_TYPES.has(t));
  if (types.length === 0 && ep.behaviors.has("onOff")) return { kind: "light", type: 0x0100 };
  if (meaningful.length === 0) return null;
  return { kind: "other", type: meaningful[0] };
}

export class UnreachableError extends Error {}

export class MatterHub {
  #controller: CommissioningController | null = null;
  #nodes = new Map<string, PairedNode>();
  #onChange: () => void;
  #commissioning = false;

  constructor(onChange: () => void) {
    this.#onChange = onChange;
  }

  async start() {
    Logger.level = process.env.RYHOME_MATTER_LOG ?? "warn";
    Logger.format = process.stdout.isTTY && !process.env.NO_COLOR ? "ansi" : "plain";
    const environment = Environment.default;
    environment.vars.set("path.root", join(dataDir, "matter"));
    this.#controller = new CommissioningController({
      environment: { environment, id: "ryhome" },
      autoConnect: false,
      adminFabricLabel: "RyHome",
      basicInformation: { vendorName: "RyHome", productName: "RyHome Controller", productLabel: "Controller", nodeLabel: "RyHome" },
    });
    await this.#controller.start();
    for (const nodeId of this.#controller.getCommissionedNodes()) {
      await this.#attach(nodeId).catch((e) => console.warn(`Couldn't load Matter node ${nodeId}:`, e));
    }
    console.log(`Matter controller ready with ${this.#nodes.size} paired node(s)`);
  }

  async stop() {
    await this.#controller?.close();
  }

  get commissioning() {
    return this.#commissioning;
  }

  async #attach(nodeId: NodeId) {
    const node = await this.#controller!.getNode(nodeId);
    this.#nodes.set(String(nodeId), node);
    node.events.attributeChanged.on(() => this.#onChange());
    node.events.stateChanged.on(() => this.#onChange());
    node.events.initialized.on(() => this.#onChange());
    node.events.structureChanged.on(() => this.#onChange());
    if (!node.isConnected) node.connect();
    return node;
  }

  async commission(code: string): Promise<string> {
    if (this.#commissioning) throw new Error("Already pairing another accessory");
    const { passcode, identifierData } = parsePairingCode(code);
    this.#commissioning = true;
    try {
      const options: NodeCommissioningOptions = {
        commissioning: {
          regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
          regulatoryCountryCode: "XX",
        },
        discovery: { identifierData },
        passcode,
      };
      const nodeId = await this.#controller!.commissionNode(options);
      const node = await this.#attach(nodeId);
      if (!node.remoteInitializationDone) {
        await Promise.race([node.events.initializedFromRemote, new Promise((r) => setTimeout(r, 30_000))]);
      }
      this.#onChange();
      return String(nodeId);
    } finally {
      this.#commissioning = false;
    }
  }

  has(nodeId: string) {
    return this.#nodes.has(nodeId);
  }

  // removes only our own fabric from the device; other controllers like apple home are untouched.
  // force skips the device and just forgets it here, leaving our pairing on the device
  async remove(nodeId: string, force = false) {
    const node = this.#nodes.get(nodeId);
    if (!node) throw new Error("Unknown node");
    if (!force) {
      try {
        await node.decommission();
      } catch (e) {
        throw new UnreachableError(`Couldn't reach the accessory to remove RyHome from it (${(e as Error).message}).`);
      }
    }
    await this.#controller!.removeNode(NodeId(BigInt(nodeId)), false);
    this.#nodes.delete(nodeId);
    this.#onChange();
  }

  devices(): MatterDevice[] {
    const devices: MatterDevice[] = [];
    for (const [nodeId, node] of this.#nodes) {
      const info = node.basicInformation;
      const baseName = info?.nodeLabel || info?.productLabel || info?.productName || "Accessory";
      const reachable = node.connectionState === NodeStates.Connected;
      const all = [...walk(node.node.parts)];
      const root = all.find((ep) => ep.number === 0);
      const found = all.filter((ep) => ep.number !== 0).flatMap((ep) => {
        const kind = classify(ep);
        return kind ? [{ ep, ...kind }] : [];
      });
      for (const { ep, kind, type, sensor, style } of found) {
        const bridged = stateOf(ep, "bridgedDeviceBasicInformation");
        const ownName = (bridged?.nodeLabel || bridged?.productName) as string | undefined;
        const base = {
          id: `matter-${nodeId}-${ep.number}`,
          nodeId,
          fallbackName: ownName || (found.length > 1 ? `${baseName} ${ep.number}` : baseName),
          reachable,
          battery: battery(ep, root),
        };
        devices.push(this.#read(ep, base, kind, type, sensor, style));
      }
    }
    return devices;
  }

  lights(): MatterLight[] {
    return this.devices().filter((d): d is MatterLight => d.kind === "light");
  }

  #read(
    ep: Endpoint,
    base: { id: string; nodeId: string; fallbackName: string; reachable: boolean; battery: number | null },
    kind: MatterDevice["kind"],
    type: number,
    sensor?: SensorType,
    style?: "plug" | "switch"
  ): MatterDevice {
    const onOff = bool(stateOf(ep, "onOff")?.onOff) ?? false;
    const level = stateOf(ep, "levelControl");
    const levelPercent = level ? Math.max(1, Math.round((num(level.currentLevel, LEVEL_MAX) / LEVEL_MAX) * 100)) : null;
    switch (kind) {
      case "light":
        return { ...base, kind, icon: "bulb", supports: this.#supports(ep), state: this.#readState(ep) };
      case "outlet":
        return { ...base, kind, style: style ?? "plug", on: onOff, brightness: levelPercent };
      case "lock": {
        const state = stateOf(ep, "doorLock")?.lockState;
        return { ...base, kind, locked: state === 1 ? true : state === 2 || state === 3 ? false : null, jammed: state === 0 };
      }
      case "blind": {
        const lift = stateOf(ep, "windowCovering")?.currentPositionLiftPercent100ths;
        return { ...base, kind, position: typeof lift === "number" ? Math.round(100 - lift / 100) : null };
      }
      case "fan": {
        const fan = stateOf(ep, "fanControl");
        const speed = typeof fan?.percentCurrent === "number" ? fan.percentCurrent : null;
        return { ...base, kind, on: num(fan?.fanMode, 0) !== 0 && (speed ?? 1) > 0, speed };
      }
      case "thermostat": {
        const t = stateOf(ep, "thermostat");
        const mode = num(t?.systemMode, -1);
        const named = ({ 0: "off", 1: "auto", 3: "cool", 4: "heat" } as Record<number, ThermostatAccessory["mode"]>)[mode] ?? "other";
        const setpoint = named === "cool" ? t?.occupiedCoolingSetpoint : t?.occupiedHeatingSetpoint;
        return {
          ...base,
          kind,
          mode: named,
          current: typeof t?.localTemperature === "number" ? t.localTemperature / 100 : null,
          target: typeof setpoint === "number" ? setpoint / 100 : null,
        };
      }
      case "sensor":
        return { ...base, kind, sensor: sensor!, value: this.#readSensor(ep, sensor!) };
      default:
        return { ...base, kind: "other", deviceType: KNOWN_NAMES[type] ?? `Matter device 0x${type.toString(16).padStart(4, "0")}` };
    }
  }

  #readSensor(ep: Endpoint, sensor: SensorType): number {
    switch (sensor) {
      case "temperature":
        return num(stateOf(ep, "temperatureMeasurement")?.measuredValue, 0) / 100;
      case "humidity":
        return num(stateOf(ep, "relativeHumidityMeasurement")?.measuredValue, 0) / 100;
      case "motion": {
        const occupancy = stateOf(ep, "occupancySensing")?.occupancy as Struct | undefined;
        return occupancy?.occupied ? 1 : 0;
      }
      case "contact":
      case "leak":
        return stateOf(ep, "booleanState")?.stateValue === true ? 1 : 0;
      case "illuminance": {
        const raw = num(stateOf(ep, "illuminanceMeasurement")?.measuredValue, 0);
        return raw <= 0 ? 0 : Math.round(10 ** ((raw - 1) / 10000));
      }
    }
  }

  #supports(ep: Endpoint): LightSupport {
    const features = ep.behaviors.has("colorControl")
      ? ((ep.maybeFeaturesOf("colorControl") ?? {}) as Record<string, boolean>)
      : {};
    return {
      brightness: ep.behaviors.has("levelControl"),
      color: !!(features.hueSaturation || features.xy),
      temperature: !!features.colorTemperature,
    };
  }

  #readState(ep: Endpoint): LightState {
    const onOff = stateOf(ep, "onOff");
    const level = stateOf(ep, "levelControl");
    const color = stateOf(ep, "colorControl");
    const colorMode = num(color?.colorMode, 2);
    let hue = Math.round((num(color?.currentHue, 0) / HUE_MAX) * 360);
    let saturation = Math.round((num(color?.currentSaturation, 0) / HUE_MAX) * 100);
    if (colorMode === 1) {
      ({ hue, saturation } = xyToHs(num(color?.currentX, 0) / XY_SCALE, num(color?.currentY, 0) / XY_SCALE));
    }
    return {
      on: onOff?.onOff === true,
      brightness: level ? Math.max(1, Math.round((num(level.currentLevel, LEVEL_MAX) / LEVEL_MAX) * 100)) : 100,
      hue,
      saturation,
      colorTemperature: num(color?.colorTemperatureMireds, 370),
      colorMode: colorMode === 2 ? "temperature" : "hs",
    };
  }

  #endpoint(id: string): Endpoint {
    const match = /^matter-(\d+)-(\d+)$/.exec(id);
    const node = match && this.#nodes.get(match[1]);
    const ep = node && [...walk(node.node.parts)].find((e) => e.number === Number(match![2]));
    if (!ep) throw new Error("Unknown accessory");
    return ep;
  }

  #commands(ep: Endpoint, behavior: string) {
    return ep.commandsOf(behavior) as Record<string, (request?: Struct) => Promise<unknown>>;
  }

  async setLight(lightId: string, patch: Partial<LightState>) {
    const ep = this.#endpoint(lightId);
    const commands = (behavior: string) => this.#commands(ep, behavior);
    if (patch.on === false) {
      await commands("onOff").off();
      return;
    }
    const features = (ep.behaviors.has("colorControl") ? ep.maybeFeaturesOf("colorControl") ?? {} : {}) as Record<string, boolean>;
    if (patch.colorMode === "temperature" && patch.colorTemperature !== undefined && features.colorTemperature) {
      await commands("colorControl").moveToColorTemperature({
        colorTemperatureMireds: Math.round(patch.colorTemperature),
        transitionTime: 0,
        ...EXECUTE_IF_OFF,
      });
    } else if (patch.hue !== undefined || patch.saturation !== undefined) {
      const current = this.#readState(ep);
      const hue = patch.hue ?? current.hue;
      const saturation = patch.saturation ?? current.saturation;
      if (features.hueSaturation) {
        await commands("colorControl").moveToHueAndSaturation({
          hue: Math.round((hue / 360) * HUE_MAX) % (HUE_MAX + 1),
          saturation: Math.round((saturation / 100) * HUE_MAX),
          transitionTime: 0,
          ...EXECUTE_IF_OFF,
        });
      } else if (features.xy) {
        const { x, y } = hsToXy(hue, saturation);
        await commands("colorControl").moveToColor({
          colorX: Math.round(x * (XY_SCALE - 1)),
          colorY: Math.round(y * (XY_SCALE - 1)),
          transitionTime: 0,
          ...EXECUTE_IF_OFF,
        });
      }
    }
    if (patch.brightness !== undefined && ep.behaviors.has("levelControl")) {
      await commands("levelControl").moveToLevelWithOnOff({
        level: Math.max(1, Math.round((patch.brightness / 100) * LEVEL_MAX)),
        transitionTime: 0,
        optionsMask: {},
        optionsOverride: {},
      });
    } else if (patch.on === true) {
      await commands("onOff").on();
    }
  }

  async setDevice(id: string, patch: DeviceStatePatch) {
    const ep = this.#endpoint(id);
    const kind = classify(ep)?.kind;
    switch (kind) {
      case "outlet":
        if (patch.on === false) return void (await this.#commands(ep, "onOff").off());
        if (patch.brightness !== undefined && ep.behaviors.has("levelControl")) {
          return void (await this.#commands(ep, "levelControl").moveToLevelWithOnOff({
            level: Math.max(1, Math.round((patch.brightness / 100) * LEVEL_MAX)),
            transitionTime: 0,
            optionsMask: {},
            optionsOverride: {},
          }));
        }
        if (patch.on === true) await this.#commands(ep, "onOff").on();
        return;
      case "lock":
        if (patch.locked === undefined) throw new Error("Send locked: true or false");
        await this.#commands(ep, "doorLock")[patch.locked ? "lockDoor" : "unlockDoor"]({});
        return;
      case "blind": {
        const covering = this.#commands(ep, "windowCovering");
        if (patch.stop) return void (await covering.stopMotion());
        if (patch.position === undefined) throw new Error("Send a position from 0 (closed) to 100 (open)");
        const features = (ep.maybeFeaturesOf("windowCovering") ?? {}) as Record<string, boolean>;
        if (features.positionAwareLift) {
          await covering.goToLiftPercentage({ liftPercent100thsValue: Math.round((100 - patch.position) * 100) });
        } else {
          await (patch.position >= 50 ? covering.upOrOpen() : covering.downOrClose());
        }
        return;
      }
      case "fan":
        if (patch.on === false) return void (await ep.setStateOf("fanControl", { fanMode: 0 }));
        if (patch.speed !== undefined) return void (await ep.setStateOf("fanControl", { percentSetting: Math.round(patch.speed) }));
        if (patch.on === true) await ep.setStateOf("fanControl", { fanMode: 3 });
        return;
      case "thermostat": {
        if (patch.targetDelta === undefined) throw new Error("Send targetDelta in degrees Celsius");
        const mode = num(stateOf(ep, "thermostat")?.systemMode, 4);
        await this.#commands(ep, "thermostat").setpointRaiseLower({
          mode: mode === 3 ? 1 : mode === 1 ? 2 : 0,
          amount: Math.round(patch.targetDelta * 10),
        });
        return;
      }
      default:
        throw new Error("RyHome can't control this kind of accessory yet");
    }
  }
}
