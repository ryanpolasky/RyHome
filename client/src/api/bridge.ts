import type { Accessory, AccessoryDetails, BridgeEvent, Capabilities, Home, LightState } from "./types";

export type ConnectionStatus = "connecting" | "online" | "offline" | "unauthorized";

export interface RyHomeBridge {
  getCapabilities(): Promise<Capabilities>;
  getHome(): Promise<Home>;
  setLight(accessoryId: string, patch: Partial<LightState>): Promise<void>;
  updateAccessory(accessoryId: string, details: AccessoryDetails): Promise<void>;
  runScene(sceneId: string): Promise<void>;
  commission(code: string, details: AccessoryDetails): Promise<{ nodeId: string; accessories: Accessory[] }>;
  removeNode(nodeId: string): Promise<void>;
  subscribe(listener: (event: BridgeEvent) => void): () => void;
  onStatus(listener: (status: ConnectionStatus) => void): () => void;
  close(): void;
}
