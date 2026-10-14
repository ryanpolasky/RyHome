import type { CSSProperties } from "react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { RyHomeBridge } from "../api/bridge";
import type { Accessory, ColorPreset, LightAccessory, LightIcon, LightState, PresetInput, Room } from "../api/types";
import { lightColor, statusText, UnitContext } from "../home";
import { ColorWheel } from "./ColorWheel";
import { GroupEditor } from "./GroupEditor";
import { Icon } from "./Icon";
import { RoomPicker } from "./RoomPicker";
import { Sheet } from "./Sheet";
import { AccessoryIcon, accessoryIcon, iconTint } from "./Tile";

const LONG_PRESS_MS = 500;

function matches(state: LightState, preset: ColorPreset): boolean {
  if (state.colorMode !== preset.colorMode) return false;
  return preset.colorMode === "temperature"
    ? Math.abs(state.colorTemperature - preset.colorTemperature) < 10
    : Math.abs(state.hue - preset.hue) < 4 && Math.abs(state.saturation - preset.saturation) < 4;
}

function Swatch({
  preset,
  selected,
  disabled,
  onApply,
  onMenu,
}: {
  preset: ColorPreset;
  selected: boolean;
  disabled: boolean;
  onApply: () => void;
  onMenu: (x: number, y: number) => void;
}) {
  const press = useRef<{ timer: number; fired: boolean } | null>(null);
  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer);
  };
  return (
    <button
      aria-label={preset.custom ? "Saved color" : "Color preset"}
      title="Right-click or hold to save the current color here"
      disabled={disabled}
      className={`preset ${selected ? "selected" : ""} ${preset.custom ? "saved" : ""}`}
      style={{ background: lightColor(preset) }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        press.current = { fired: false, timer: window.setTimeout(() => {
          press.current!.fired = true;
          onMenu(rect.left + rect.width / 2, rect.top);
        }, LONG_PRESS_MS) };
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onClick={() => {
        if (press.current?.fired) return;
        onApply();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        cancel();
        onMenu(e.clientX, e.clientY);
      }}
    />
  );
}

function SwatchMenu({
  x,
  y,
  custom,
  onSave,
  onReset,
  onClose,
}: {
  x: number;
  y: number;
  custom: boolean;
  onSave: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  const pick = (action: () => void) => () => {
    action();
    onClose();
  };
  return (
    <div className="menu swatch-menu" style={{ left: x, top: y }} onPointerDown={(e) => e.stopPropagation()}>
      <button className="menu-item" onClick={pick(onSave)}>
        Save Current Color Here
      </button>
      {custom && (
        <button className="menu-item" onClick={pick(onReset)}>
          Reset to Default
        </button>
      )}
    </div>
  );
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

function BrightnessStatus({ light, onChange }: { light: LightAccessory; onChange: (patch: Partial<LightState>) => void }) {
  const unit = useContext(UnitContext);
  const [draft, setDraft] = useState<string | null>(null);
  if (!light.reachable || !light.supports.brightness) return <>{statusText(light, unit)}</>;

  const commit = () => {
    const value = draft === null ? NaN : Number(draft.replace("%", "").trim());
    setDraft(null);
    if (!Number.isFinite(value)) return;
    const level = Math.round(Math.min(100, Math.max(0, value)));
    onChange(level === 0 ? { on: false } : { on: true, brightness: level });
  };

  if (draft !== null) {
    return (
      <span className="brightness-entry">
        <input
          autoFocus
          inputMode="numeric"
          value={draft}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              e.stopPropagation();
              setDraft(null);
            }
          }}
        />
        %
      </span>
    );
  }
  return (
    <button
      className="brightness-status"
      title="Type a brightness"
      onClick={() => setDraft(String(light.state.on ? light.state.brightness : 0))}
    >
      {statusText(light, unit)}
    </button>
  );
}

function LightControls({
  light,
  members,
  presets,
  onSetLight,
  onSavePreset,
  onToggleMember,
}: {
  light: LightAccessory;
  members: LightAccessory[];
  presets: ColorPreset[];
  onSetLight: (patch: Partial<LightState>) => void;
  onSavePreset: (index: number, preset: PresetInput) => void;
  onToggleMember: (id: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const available = presets
    .map((preset, index) => ({ preset, index }))
    .filter(({ preset }) => (preset.colorMode === "hs" ? light.supports.color : light.supports.temperature));
  const canPick = light.supports.color || light.supports.temperature;
  const custom = !available.some(({ preset }) => matches(light.state, preset));
  const { colorMode, hue, saturation, colorTemperature } = light.state;
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
          {available.map(({ preset, index }) => (
            <Swatch
              key={index}
              preset={preset}
              selected={matches(light.state, preset)}
              disabled={!light.reachable}
              onApply={() => {
                const { custom: _, ...patch } = preset;
                onSetLight({ ...patch, on: true });
              }}
              onMenu={(x, y) => setMenu({ index, x, y })}
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
      {picking && <p className="add-hint">Right-click or hold a swatch to save this color there.</p>}
      {menu && (
        <SwatchMenu
          x={menu.x}
          y={menu.y}
          custom={presets[menu.index].custom}
          onSave={() => onSavePreset(menu.index, { colorMode, hue, saturation, colorTemperature })}
          onReset={() => onSavePreset(menu.index, null)}
          onClose={closeMenu}
        />
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
  presets,
  onSavePreset,
}: {
  accessory: Accessory;
  accessories: Accessory[];
  rooms: Room[];
  bridge: RyHomeBridge;
  canGroup: boolean;
  onClose: () => void;
  onSetLight: (patch: Partial<LightState>) => void;
  onToggleLight: (id: string) => void;
  presets: ColorPreset[];
  onSavePreset: (index: number, preset: PresetInput) => void;
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
      status={
        accessory.kind === "light" && mode === "controls" ? (
          <BrightnessStatus light={accessory} onChange={onSetLight} />
        ) : (
          statusText(accessory, unit)
        )
      }
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
        <LightControls
          light={accessory}
          members={members}
          presets={presets}
          onSetLight={onSetLight}
          onSavePreset={onSavePreset}
          onToggleMember={onToggleLight}
        />
      )}
    </Sheet>
  );
}
