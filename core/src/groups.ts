import { randomUUID } from "node:crypto";
import { cleanOverride } from "./accessories.js";
import { readJson, writeJson } from "./config.js";
import type { LightIcon } from "./types.js";

export interface Group {
  id: string;
  name: string;
  room?: string;
  icon: LightIcon;
  members: string[];
}

const FILE = "groups.json";
export const GROUP_PREFIX = "group-";

export class GroupStore {
  groups = readJson<Group[]>(FILE, []);

  #save() {
    writeJson(FILE, this.groups);
  }

  get(id: string) {
    return this.groups.find((g) => g.id === id);
  }

  groupOf(memberId: string) {
    return this.groups.find((g) => g.members.includes(memberId));
  }

  // a light can only be in one group, so joining a new one pulls it out of the old
  #claim(members: string[], except: string) {
    for (const group of this.groups) {
      if (group.id !== except) group.members = group.members.filter((m) => !members.includes(m));
    }
    this.groups = this.groups.filter((g) => g.id === except || g.members.length > 1);
  }

  #clean(input: unknown, knownIds: Set<string>, base?: Group): Omit<Group, "id"> {
    const raw = (input ?? {}) as Record<string, unknown>;
    const details = cleanOverride({ name: raw.name, room: raw.room, icon: raw.icon });
    const members = raw.members === undefined ? base?.members : raw.members;
    if (!Array.isArray(members) || members.some((m) => typeof m !== "string" || !knownIds.has(m))) {
      throw new Error("members must be a list of light ids");
    }
    const unique = [...new Set(members as string[])];
    if (unique.length < 2) throw new Error("A group needs at least two lights");
    const name = details.name ?? base?.name;
    if (!name) throw new Error("Group needs a name");
    return {
      name,
      room: "room" in raw ? details.room : base?.room,
      icon: details.icon ?? base?.icon ?? "bulb",
      members: unique,
    };
  }

  create(input: unknown, knownIds: Set<string>): Group {
    const group = { id: `${GROUP_PREFIX}${randomUUID()}`, ...this.#clean(input, knownIds) };
    this.groups.push(group);
    this.#claim(group.members, group.id);
    this.#save();
    return group;
  }

  update(id: string, input: unknown, knownIds: Set<string>): Group | undefined {
    const index = this.groups.findIndex((g) => g.id === id);
    if (index < 0) return undefined;
    this.groups[index] = { id, ...this.#clean(input, knownIds, this.groups[index]) };
    this.#claim(this.groups[index].members, id);
    this.#save();
    return this.groups[index];
  }

  delete(id: string): boolean {
    const before = this.groups.length;
    this.groups = this.groups.filter((g) => g.id !== id);
    if (this.groups.length === before) return false;
    this.#save();
    return true;
  }

  forget(memberPrefix: string) {
    for (const group of this.groups) group.members = group.members.filter((m) => !m.startsWith(memberPrefix));
    this.groups = this.groups.filter((g) => g.members.length > 1);
    this.#save();
  }
}
