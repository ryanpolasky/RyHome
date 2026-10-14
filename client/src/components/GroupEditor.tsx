import { useState } from "react";
import type { RyHomeBridge } from "../api/bridge";
import type { LightAccessory, Room } from "../api/types";
import { Icon } from "./Icon";
import { RoomPicker } from "./RoomPicker";
import { accessoryIcon } from "./Tile";

export function GroupEditor({
  bridge,
  lights,
  rooms,
  group,
  seed,
  onDone,
}: {
  bridge: RyHomeBridge;
  lights: LightAccessory[];
  rooms: Room[];
  group?: LightAccessory;
  seed?: LightAccessory;
  onDone: () => void;
}) {
  const roomName = (id: string | undefined) => rooms.find((r) => r.id === id)?.name ?? "";
  const groupNames = new Map(lights.filter((l) => l.members).map((g) => [g.id, g.name]));
  const choices = lights.filter((l) => !l.members);
  const [name, setName] = useState(group?.name ?? (seed ? `${seed.name} Group` : "New Group"));
  const [room, setRoom] = useState(roomName(group?.roomId ?? seed?.roomId));
  const [members, setMembers] = useState<string[]>(group?.members ?? (seed ? [seed.id] : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const input = { name: name.trim(), room: room || undefined, members };
      if (group) await bridge.updateGroup(group.id, input);
      else await bridge.createGroup({ ...input, icon: seed?.icon });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="settings-panel">
      <label className="settings-row">
        <span>Group name</span>
        <input className="settings-input" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="settings-row">
        <span>Room</span>
        <RoomPicker rooms={rooms} value={room} disabled={busy} onChange={setRoom} />
      </label>
      <div className="member-list">
        {choices.map((light) => {
          const elsewhere = light.groupId && light.groupId !== group?.id ? groupNames.get(light.groupId) : undefined;
          const checked = members.includes(light.id);
          return (
            <button key={light.id} className={`member-choice ${checked ? "checked" : ""}`} disabled={busy} onClick={() => toggle(light.id)}>
              <span className="member-check">{checked && <Icon name="check" size={12} />}</span>
              <Icon name={accessoryIcon(light)} size={16} />
              <span className="member-name">{light.name}</span>
              <span className="member-room">{elsewhere ? `In ${elsewhere}` : roomName(light.roomId)}</span>
            </button>
          );
        })}
      </div>
      <p className={`settings-error ${error ? "visible" : ""}`}>{error ?? "\u00a0"}</p>
      <div className="settings-actions">
        <button className="glass-button" disabled={busy} onClick={onDone}>
          Cancel
        </button>
        <button className="glass-button primary" disabled={busy || members.length < 2 || !name.trim()} onClick={save}>
          {busy ? "Saving..." : group ? "Save" : "Create Group"}
        </button>
      </div>
    </div>
  );
}
