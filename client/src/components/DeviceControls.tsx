import type { CSSProperties } from "react";
import { useContext, useRef } from "react";
import type { Accessory, DeviceStatePatch } from "../api/types";
import { formatTemperature, sensorValue, statusText, UnitContext } from "../home";
import { Icon } from "./Icon";
import { AccessoryIcon, accessoryIcon } from "./Tile";

export function LevelSlider({
  level,
  fill = "#fff",
  icon = "sun",
  disabled,
  onLevel,
  onTap,
}: {
  level: number;
  fill?: string;
  icon?: "sun" | "fan" | "blinds";
  disabled?: boolean;
  onLevel: (level: number) => void;
  onTap?: () => void;
}) {
  const drag = useRef<{ y: number; start: number; moved: boolean; height: number } | null>(null);
  return (
    <div
      className={`brightness-slider ${disabled ? "disabled" : ""}`}
      style={{ "--level": `${level}%`, "--fill": fill } as CSSProperties}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, start: level, moved: false, height: e.currentTarget.clientHeight };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const delta = d.y - e.clientY;
        if (!d.moved && Math.abs(delta) < 3) return;
        d.moved = true;
        onLevel(Math.round(Math.min(100, Math.max(0, d.start + (delta / d.height) * 100))));
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved) onTap?.();
      }}
      onPointerCancel={() => (drag.current = null)}
    >
      <div className="brightness-fill" />
      <Icon name={icon} size={22} className="brightness-icon" />
    </div>
  );
}

function PowerButton({ on, disabled, icon, onToggle }: { on: boolean; disabled: boolean; icon: Parameters<typeof Icon>[0]["name"]; onToggle: () => void }) {
  return (
    <button className={`power-button ${on ? "on" : ""}`} disabled={disabled} onClick={onToggle}>
      <Icon name={icon} size={40} />
    </button>
  );
}

function BatteryNote({ level }: { level?: number | null }) {
  if (level === null || level === undefined) return null;
  return <p className={`add-hint ${level <= 15 ? "low-battery" : ""}`}>Battery {level}%</p>;
}

export function DeviceControls({ accessory, onChange }: { accessory: Accessory; onChange: (patch: DeviceStatePatch) => void }) {
  const unit = useContext(UnitContext);
  const disabled = !accessory.reachable;
  switch (accessory.kind) {
    case "outlet":
      return (
        <>
          {accessory.brightness !== null ? (
            <LevelSlider
              level={accessory.on ? accessory.brightness : 0}
              disabled={disabled}
              onLevel={(level) => onChange(level === 0 ? { on: false } : { brightness: level })}
              onTap={() => onChange({ on: !accessory.on })}
            />
          ) : (
            <PowerButton on={accessory.on} disabled={disabled} icon={accessoryIcon(accessory)} onToggle={() => onChange({ on: !accessory.on })} />
          )}
          <BatteryNote level={accessory.battery} />
        </>
      );
    case "fan":
      return (
        <>
          {accessory.speed !== null ? (
            <LevelSlider
              level={accessory.on ? accessory.speed : 0}
              icon="fan"
              disabled={disabled}
              onLevel={(level) => onChange(level === 0 ? { on: false } : { speed: level })}
              onTap={() => onChange({ on: !accessory.on })}
            />
          ) : (
            <PowerButton on={accessory.on} disabled={disabled} icon="fan" onToggle={() => onChange({ on: !accessory.on })} />
          )}
        </>
      );
    case "lock":
      return (
        <>
          <button
            className={`power-button lock-button ${accessory.locked === false ? "on" : ""}`}
            disabled={disabled}
            onClick={() => onChange({ locked: accessory.locked === false })}
          >
            <Icon name={accessory.locked === false ? "lockOpen" : "lock"} size={40} />
          </button>
          <p className="add-lead">{accessory.locked === false ? "Tap to Lock" : "Tap to Unlock"}</p>
          <BatteryNote level={accessory.battery} />
        </>
      );
    case "blind":
      return (
        <>
          <LevelSlider level={accessory.position ?? 0} icon="blinds" disabled={disabled || accessory.position === null} onLevel={(position) => onChange({ position })} />
          <div className="settings-actions">
            <button className="glass-button" disabled={disabled} onClick={() => onChange({ position: 0 })}>
              Close
            </button>
            <button className="glass-button" disabled={disabled} onClick={() => onChange({ stop: true })}>
              <Icon name="stop" size={12} />
            </button>
            <button className="glass-button" disabled={disabled} onClick={() => onChange({ position: 100 })}>
              Open
            </button>
          </div>
          <BatteryNote level={accessory.battery} />
        </>
      );
    case "thermostat": {
      const step = unit === "F" ? 5 / 9 : 0.5;
      return (
        <div className="big-readout thermostat">
          <span className="sensor-value">{accessory.current !== null ? formatTemperature(accessory.current, unit) : "--"}</span>
          <span>Currently</span>
          {accessory.target !== null && accessory.mode !== "off" && (
            <div className="thermostat-target">
              <button className="glass-button round" disabled={disabled} onClick={() => onChange({ targetDelta: -step })} aria-label="Lower">
                <Icon name="minus" size={16} />
              </button>
              <div>
                <div className="thermostat-value">{formatTemperature(accessory.target, unit)}</div>
                <div className="thermostat-mode">{statusText(accessory, unit)}</div>
              </div>
              <button className="glass-button round" disabled={disabled} onClick={() => onChange({ targetDelta: step })} aria-label="Raise">
                <Icon name="plus" size={16} />
              </button>
            </div>
          )}
          {accessory.mode === "off" && <span>Turned off. Change its mode in the thermostat's own app for now.</span>}
        </div>
      );
    }
    case "sensor": {
      const numeric = ["temperature", "humidity", "illuminance"].includes(accessory.sensor);
      const label = { temperature: "Current Temperature", humidity: "Current Humidity", illuminance: "Light Level", motion: "", contact: "", leak: "" }[accessory.sensor];
      return (
        <div className="big-readout">
          {numeric ? <span className="sensor-value">{sensorValue(accessory, unit)}</span> : <AccessoryIcon accessory={accessory} size={64} />}
          <span>{numeric ? label : statusText(accessory, unit)}</span>
          <BatteryNote level={accessory.battery} />
        </div>
      );
    }
    case "other":
      return (
        <div className="big-readout">
          <Icon name="unknown" size={64} />
          <span>{accessory.deviceType}</span>
          <span className="add-hint">RyHome can't control this kind of accessory yet, but it's paired and you can rename or remove it.</span>
        </div>
      );
    default:
      return null;
  }
}
