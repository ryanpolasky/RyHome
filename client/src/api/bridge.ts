import type { Accessory, BridgeEvent, Capabilities, Home, HomeKitCandidate, LightState } from "./types";

export type ConnectionStatus = "connecting" | "online" | "offline" | "unauthorized";

export interface RyHomeBridge {
  getCapabilities(): Promise<Capabilities>;
  getHome(): Promise<Home>;
  setLight(accessoryId: string, patch: Partial<LightState>): Promise<void>;
  runScene(sceneId: string): Promise<void>;
  getHomeKitAccessories(): Promise<HomeKitCandidate[]>;
  commission(code: string, homeKitId: string | null): Promise<{ nodeId: string; accessories: Accessory[] }>;
  linkNode(nodeId: string, homeKitId: string | null): Promise<void>;
  removeNode(nodeId: string): Promise<void>;
  subscribe(listener: (event: BridgeEvent) => void): () => void;
  onStatus(listener: (status: ConnectionStatus) => void): () => void;
  close(): void;
}
