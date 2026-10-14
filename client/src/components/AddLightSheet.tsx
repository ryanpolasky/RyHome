import { useState } from "react";
import type { RyHomeBridge } from "../api/bridge";
import type { Accessory, Room } from "../api/types";
import { Icon } from "./Icon";
import { RoomPicker } from "./RoomPicker";
import { Sheet } from "./Sheet";

export function AddLightSheet({ bridge, rooms, onClose }: { bridge: RyHomeBridge; rooms: Room[]; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Accessory[] | null>(null);

  async function pair() {
    setBusy(true);
    setError(null);
    try {
      const result = await bridge.commission(code, { name: name || undefined, room: room || undefined });
      setAdded(result.accessories);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet icon={<Icon name="bulb" size={20} />} title="Add Light" status="Any Matter light on this network" onClose={busy ? () => {} : onClose}>
      {added ? (
        <div className="add-panel">
          <p className="add-lead">
            {added.length > 0 ? `Added ${added.map((a) => a.name).join(", ")}.` : "Paired, but it didn't report any lights."}
          </p>
          <button className="glass-button primary" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <div className="add-panel">
          <ol className="add-steps">
            <li>
              In the app the light already uses, turn on pairing mode. In Apple Home that's the light's settings, then{" "}
              <strong>Turn On Pairing Mode</strong>.
            </li>
            <li>Type the setup code it shows below. The light keeps working in that app too.</li>
          </ol>
          <input
            className="code-input"
            placeholder="1234-567-8901"
            value={code}
            autoFocus
            disabled={busy}
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && code.trim() && !busy && pair()}
          />
          <label className="settings-row">
            <span>Name</span>
            <input
              className="settings-input"
              placeholder="Use the light's own name"
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="settings-row">
            <span>Room</span>
            <RoomPicker rooms={rooms} value={room} disabled={busy} onChange={setRoom} />
          </label>
          <p className={`settings-error ${error ? "visible" : ""}`}>{error ?? "\u00a0"}</p>
          <button className="glass-button primary" disabled={busy || !code.trim()} onClick={pair}>
            {busy ? "Pairing..." : "Add Light"}
          </button>
          {busy && <p className="add-hint">This can take up to a minute.</p>}
        </div>
      )}
    </Sheet>
  );
}
