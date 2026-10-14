import { join } from "node:path";
import { Environment, Logger, type Endpoint } from "@matter/main";
import { GeneralCommissioning } from "@matter/main/clusters";
import { ManualPairingCodeCodec, NodeId, QrPairingCodeCodec } from "@matter/main/types";
import { CommissioningController, type NodeCommissioningOptions } from "@project-chip/matter.js";
import { NodeStates, type PairedNode } from "@project-chip/matter.js/device";
import { hsToXy, xyToHs } from "./color.js";
import { dataDir } from "./config.js";
import type { LightState, LightSupport } from "./types.js";

export interface MatterLight {
  id: string;
  nodeId: string;
  serial: string | null;
  vendorId: number | null;
  productId: number | null;
  fallbackName: string;
  reachable: boolean;
  supports: LightSupport;
  state: LightState;
}

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

  // removes only our own fabric from the device; other controllers like apple home are untouched
  async remove(nodeId: string) {
    const node = this.#nodes.get(nodeId);
    if (!node) throw new Error("Unknown node");
    await this.#controller!.removeNode(NodeId(BigInt(nodeId)), true);
    this.#nodes.delete(nodeId);
    this.#onChange();
  }

  lights(): MatterLight[] {
    const lights: MatterLight[] = [];
    for (const [nodeId, node] of this.#nodes) {
      const info = node.basicInformation;
      const serial = typeof info?.serialNumber === "string" && info.serialNumber.trim() ? info.serialNumber.trim() : null;
      const baseName = info?.nodeLabel || info?.productLabel || info?.productName || "Light";
      const endpoints = [...walk(node.node.parts)].filter((ep) => ep.number !== 0 && ep.behaviors.has("onOff"));
      for (const ep of endpoints) {
        lights.push({
          id: `matter-${nodeId}-${ep.number}`,
          nodeId,
          serial,
          vendorId: typeof info?.vendorId === "number" ? info.vendorId : null,
          productId: typeof info?.productId === "number" ? info.productId : null,
          fallbackName: endpoints.length > 1 ? `${baseName} ${ep.number}` : baseName,
          reachable: node.connectionState === NodeStates.Connected,
          supports: this.#supports(ep),
          state: this.#readState(ep),
        });
      }
    }
    return lights;
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

  #endpoint(lightId: string): Endpoint {
    const match = /^matter-(\d+)-(\d+)$/.exec(lightId);
    const node = match && this.#nodes.get(match[1]);
    const ep = node && [...walk(node.node.parts)].find((e) => e.number === Number(match![2]));
    if (!ep) throw new Error("Unknown light");
    return ep;
  }

  async setLight(lightId: string, patch: Partial<LightState>) {
    const ep = this.#endpoint(lightId);
    const commands = (behavior: string) => ep.commandsOf(behavior) as Record<string, (request?: Struct) => Promise<unknown>>;
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
}
