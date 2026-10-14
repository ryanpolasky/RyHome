import type { CSSProperties } from "react";
import { useContext, useRef, useState } from "react";
import type { RyHomeBridge } from "../api/bridge";
import type { Accessory, LightAccessory, LightIcon, LightState, Room } from "../api/types";
import { lightColor, statusText, UnitContext } from "../home";
import { ColorWheel } from "./ColorWheel";
import { GroupEditor } from "./GroupEditor";
import { Icon } from "./Icon";
import { RoomPicker } from "./RoomPicker";
import { Sheet } from "./Sheet";
import { AccessoryIcon, accessoryIcon, iconTint } from "./Tile";

type Preset = { id: string; kind: "temperature" | "color"; patch: Pick<LightState, "colorMode" | "hue" | "saturation" | "colorTemperature"> };

const presets: Preset[] = [
  { id: "warm", kind: "temperature", patch: { colorMode: "temperature", colorTemperature: 454, hue: 30, saturation: 50 } },
  { id: "soft", kind: "temperature", patch: { colorMode: "temperature", colorTemperature: 370, hue: 35, saturation: 40 } },
  { id: "daylight", kind: "temperature", patch: { colorMode: "temperature", colorTemperature: 250, hue: 45, saturation: 15 } },
  { id: "cool", kind: "temperature", patch: { colorMode: "temperature", colorTemperature: 160, hue: 210, saturation: 10 } },
  { id: "red", kind: "color", patch: { colorMode: "hs", hue: 0, saturation: 85, colorTemperature: 370 } },
  { id: "orange", kind: "color", patch: { colorMode: "hs", hue: 28, saturation: 90, colorTemperature: 370 } },
  { id: "purple", kind: "color", patch: { colorMode: "hs", hue: 270, saturation: 75, colorTemperature: 370 } },
  { id: "blue", kind: "color", patch: { colorMode: "hs", hue: 215, saturation: 80, colorTemperature: 370 } },
];

function matches(state: LightState, patch: Preset["patch"]): boolean {
  if (state.colorMode !== patch.colorMode) return false;
  return patch.colorMode === "temperature"
    ? Math.abs(state.colorTemperature - patch.colorTemperature) < 10
    : Math.abs(state.hue - patch.hue) < 4 && Math.abs(state.saturation - patch.saturation) < 4;
}

function BrightnessSlider({ light, onChange }: { light: LightAccessory; onChange: (patch: Partial<LightState>) => void }) {
  const drag = useRef<{ y: number; start: number; moved: boolean; height: number } | null>(null);
  const level = light.state.on ? light.state.brightness : 0;

  return (
    <div
      className={`brightness-slider ${light.reachable ? "" : "disabled"}`}
      style={{ "--level": `${level}%`, "--fill": lightColor(light.state) } as CSSProperties}
      onPointerDown={(e) => {
        if (!light.reachable) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, start: level, moved: false, height: e.currentTarget.clientHeight };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const delta = d.y - e.clientY;
        if (!d.moved && Math.abs(delta) < 3) return;
        d.moved = true;
        const next = Math.round(Math.min(100, Math.max(0, d.start + (delta / d.height) * 100)));
        onChange(next === 0 ? { on: false } : { on: true, brightness: next });
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved) onChange({ on: !light.state.on });
      }}
      onPointerCancel={() => (drag.current = null)}
    >
      <div className="brightness-fill" />
      <Icon name="sun" size={22} className="brightness-icon" />
    </div>
  );
}

function LightControls({
  light,
  members,
  onSetLight,
  onToggleMember,
}: {
  light: LightAccessory;
  members: LightAccessory[];
  onSetLight: (patch: Partial<LightState>) => void;
  onToggleMember: (id: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const available = presets.filter((p) => (p.kind === "color" ? light.supports.color : light.supports.temperature));
  const canPick = light.supports.color || light.supports.temperature;
  const custom = !available.some((p) => matches(light.state, p.patch));
  return (
    <>
      <div className="controls-row">
        {light.supports.brightness ? (
          <BrightnessSlider light={light} onChange={onSetLight} />
        ) : (
          <button
            className={`power-button ${light.state.on ? "on" : ""}`}
            disabled={!light.reachable}
            onClick={() => onSetLight({ on: !light.state.on })}
          >
            <Icon name="bulb" size={40} />
          </button>
        )}
        {picking && (
          <ColorWheel
            state={light.state}
            color={light.supports.color}
            temperature={light.supports.temperature}
            disabled={!light.reachable}
            onChange={onSetLight}
          />
        )}
      </div>
      {available.length > 0 && (
        <div className="presets">
          {available.map((p) => (
            <button
              key={p.id}
              aria-label={p.id}
              disabled={!light.reachable}
              className={`preset ${matches(light.state, p.patch) ? "selected" : ""}`}
              style={{ background: lightColor(p.patch) }}
              onClick={() => onSetLight({ ...p.patch, on: true })}
            />
          ))}
          {canPick && (
            <button
              aria-label="Custom color"
              className={`preset custom ${picking || custom ? "selected" : ""}`}
              disabled={!light.reachable}
              onClick={() => setPicking(!picking)}
            />
          )}
        </div>
      )}
      {members.length > 0 && (
        <div className="member-strip">
          {members.map((m) => (
            <button key={m.id} className={`member-chip ${m.state.on ? "on" : ""}`} disabled={!m.reachable} onClick={() => onToggleMember(m.id)}>
              <Icon name={accessoryIcon(m)} size={14} />
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const iconChoices: LightIcon[] = ["bulb", "ceiling", "tableLamp", "floorLamp", "lightstrip"];

function LightSettings({
  light,
  rooms,
  bridge,
  canGroup,
  onGroup,
  onRemoved,
}: {
  light: LightAccessory;
  rooms: Room[];
  bridge: RyHomeBridge;
  canGroup: boolean;
  onGroup: () => void;
  onRemoved: () => void;
}) {
  const isGroup = !!light.members;
  const [name, setName] = useState(light.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const room = rooms.find((r) => r.id === light.roomId)?.name ?? "";

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const saveName = () => name.trim() && name.trim() !== light.name && run(() => bridge.updateAccessory(light.id, { name: name.trim() }));

  return (
    <div className="settings-panel">
      <label className="settings-row">
        <span>Name</span>
        <input
          className="settings-input"
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </label>
      <label className="settings-row">
        <span>Room</span>
        <RoomPicker rooms={rooms} value={room} disabled={busy} onChange={(r) => run(() => bridge.updateAccessory(light.id, { room: r }))} />
      </label>
      <div className="settings-row">
        <span>Icon</span>
        <div className="icon-choices">
          {iconChoices.map((icon) => (
            <button
              key={icon}
              aria-label={icon}
              className={`icon-choice ${light.icon === icon ? "selected" : ""}`}
              disabled={busy}
              onClick={() => run(() => bridge.updateAccessory(light.id, { icon }))}
            >
              <Icon name={icon} size={18} />
            </button>
          ))}
        </div>
      </div>
      {canGroup && (
        <button className="glass-button" disabled={busy} onClick={onGroup}>
          {isGroup ? "Edit Lights in Group..." : "Group with Other Lights..."}
        </button>
      )}
      {(isGroup || light.matterNodeId) &&
        (confirming ? (
          <div className="settings-confirm">
            <p>
              {isGroup
                ? "The lights stay in RyHome and go back to showing on their own."
                : "RyHome will stop controlling this light. It keeps working in any other app it's paired with."}
            </p>
            <div className="settings-actions">
              <button className="glass-button" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                className="glass-button destructive"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await (isGroup ? bridge.deleteGroup(light.id) : bridge.removeNode(light.matterNodeId!));
                    onRemoved();
                  })
                }
              >
                {busy ? "Working..." : isGroup ? "Ungroup" : "Remove"}
              </button>
            </div>
          </div>
        ) : (
          <button className="glass-button destructive" onClick={() => setConfirming(true)}>
            {isGroup ? "Ungroup" : "Remove from RyHome"}
          </button>
        ))}
      <p className={`settings-error ${error ? "visible" : ""}`}>{error ?? " "}</p>
    </div>
  );
}

function Readout({ accessory }: { accessory: Exclude<Accessory, LightAccessory> }) {
  switch (accessory.kind) {
    case "camera":
      return (
        <div className="camera-view">
          <div className="camera-feed" />
          <span>Live view isn't hooked up yet</span>
        </div>
      );
    case "sensor":
      return (
        <div className="big-readout">
          <AccessoryIcon accessory={accessory} />
          <span>{accessory.sensor === "temperature" ? "Current Temperature" : "Current Humidity"}</span>
        </div>
      );
    case "television":
    case "speaker":
      return (
        <div className="big-readout media">
          <AccessoryIcon accessory={accessory} size={64} />
          <span>{accessory.playing ? accessory.nowPlaying ?? "Playing" : "Not Playing"}</span>
        </div>
      );
  }
}

export function ControlsSheet({
  accessory,
  accessories,
  rooms,
  bridge,
  canGroup,
  onClose,
  onSetLight,
  onToggleLight,
}: {
  accessory: Accessory;
  accessories: Accessory[];
  rooms: Room[];
  bridge: RyHomeBridge;
  canGroup: boolean;
  onClose: () => void;
  onSetLight: (patch: Partial<LightState>) => void;
  onToggleLight: (id: string) => void;
}) {
  const unit = useContext(UnitContext);
  const [mode, setMode] = useState<"controls" | "settings" | "group">("controls");
  const lights = accessories.filter((a): a is LightAccessory => a.kind === "light");
  const members = accessory.kind === "light" && accessory.members ? lights.filter((l) => accessory.members!.includes(l.id)) : [];
  const settingsLabel = accessory.kind === "light" && accessory.members ? "Group Settings" : "Light Settings";

  return (
    <Sheet
      icon={<AccessoryIcon accessory={accessory} size={20} />}
      tint={iconTint(accessory)}
      title={accessory.name}
      status={statusText(accessory, unit)}
      onClose={onClose}
      footer={
        accessory.kind === "light" &&
        mode !== "group" && (
          <button className="glass-button" onClick={() => setMode(mode === "controls" ? "settings" : "controls")}>
            {mode === "controls" ? settingsLabel : "Done"}
          </button>
        )
      }
    >
      {accessory.kind !== "light" ? (
        <Readout accessory={accessory} />
      ) : mode === "group" ? (
        <GroupEditor
          bridge={bridge}
          lights={lights}
          rooms={rooms}
          group={accessory.members ? accessory : undefined}
          seed={accessory.members ? undefined : accessory}
          onDone={() => (accessory.members ? setMode("settings") : onClose())}
        />
      ) : mode === "settings" ? (
        <LightSettings
          light={accessory}
          rooms={rooms}
          bridge={bridge}
          canGroup={canGroup}
          onGroup={() => setMode("group")}
          onRemoved={onClose}
        />
      ) : (
        <LightControls light={accessory} members={members} onSetLight={onSetLight} onToggleMember={onToggleLight} />
      )}
    </Sheet>
  );
}
