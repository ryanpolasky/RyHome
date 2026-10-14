import type { Accessory, AccessoryDetails, BridgeEvent, Capabilities, GroupInput, Home, LightState } from "./types";

export type ConnectionStatus = "connecting" | "online" | "offline" | "unauthorized";

export interface RyHomeBridge {
  getCapabilities(): Promise<Capabilities>;
  getHome(): Promise<Home>;
  setLight(accessoryId: string, patch: Partial<LightState>): Promise<void>;
  updateAccessory(accessoryId: string, details: AccessoryDetails): Promise<void>;
  runScene(sceneId: string): Promise<void>;
  createGroup(group: GroupInput): Promise<void>;
  updateGroup(groupId: string, group: Partial<GroupInput>): Promise<void>;
  deleteGroup(groupId: string): Promise<void>;
  commission(code: string, details: AccessoryDetails): Promise<{ nodeId: string; accessories: Accessory[] }>;
  removeNode(nodeId: string): Promise<void>;
  subscribe(listener: (event: BridgeEvent) => void): () => void;
  onStatus(listener: (status: ConnectionStatus) => void): () => void;
  close(): void;
}
