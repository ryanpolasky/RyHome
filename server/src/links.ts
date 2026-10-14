import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir, writePrivate } from "./config.js";
import type { HomeKitAccessory, HomeKitInfo } from "./homekit.js";
import type { MatterLight } from "./matter.js";

const file = join(dataDir, "links.json");

// remembers which home app accessory each matter node is, keyed by node id
export class LinkStore {
  links: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};

  set(nodeId: string, homeKitId: string | null) {
    if (homeKitId) this.links[nodeId] = homeKitId;
    else delete this.links[nodeId];
    writePrivate(file, `${JSON.stringify(this.links, null, 2)}\n`);
  }

  resolve(lights: MatterLight[], homeKit: HomeKitInfo | null): Map<string, HomeKitAccessory> {
    const result = new Map<string, HomeKitAccessory>();
    if (!homeKit) return result;
    const byId = new Map(homeKit.accessories.map((a) => [a.id, a]));
    const taken = new Set<string>();
    const nodes = new Map(lights.map((l) => [l.nodeId, l]));

    for (const [nodeId, homeKitId] of Object.entries(this.links)) {
      const accessory = byId.get(homeKitId);
      if (accessory && nodes.has(nodeId)) {
        result.set(nodeId, accessory);
        taken.add(accessory.id);
      }
    }
    for (const light of nodes.values()) {
      if (result.has(light.nodeId)) continue;
      const free = homeKit.accessories.filter((a) => !taken.has(a.id));
      let match = light.serial ? free.find((a) => a.serial === light.serial) : undefined;
      if (!match && light.vendorId !== null && light.productId !== null) {
        const same = free.filter((a) => a.vendorId === light.vendorId && a.productId === light.productId);
        const pairedSame = [...nodes.values()].filter(
          (l) => !result.has(l.nodeId) && l.vendorId === light.vendorId && l.productId === light.productId
        );
        if (same.length === 1 && pairedSame.length === 1) match = same[0];
      }
      if (match) {
        result.set(light.nodeId, match);
        taken.add(match.id);
        this.set(light.nodeId, match.id);
      }
    }
    return result;
  }
}
