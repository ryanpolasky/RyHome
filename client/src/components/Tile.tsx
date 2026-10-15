import type { CSSProperties } from "react";
import { useContext } from "react";
import type { Accessory, Scene } from "../api/types";
import { formatTemperature, isActive, lightIconColor, sensorValue, statusText, UnitContext } from "../home";
import type { IconName } from "./Icon";
import { Icon } from "./Icon";

export function accessoryIcon(accessory: Accessory): IconName {
  switch (accessory.kind) {
    case "outlet":
      return accessory.style === "switch" ? "wallSwitch" : "plug";
    case "lock":
      return accessory.locked === false ? "lockOpen" : "lock";
    case "blind":
      return "blinds";
    case "fan":
      return "fan";
    case "thermostat":
      return "thermometer";
    case "other":
      return "unknown";
    case "light":
      return accessory.icon === "bulb" ? "bulb" : accessory.icon;
    case "camera":
      return "doorbell";
    case "television":
      return "appleTv";
    case "speaker":
      return "homepod";
    case "sensor":
      return ({ temperature: "thermometer", humidity: "drop", motion: "motion", contact: accessory.value ? "contact" : "contactOpen", leak: "leak", illuminance: "illuminance" } as const)[accessory.sensor];
  }
}

export function toggleable(accessory: Accessory): boolean {
  return ["light", "outlet", "fan", "lock", "blind"].includes(accessory.kind);
}

export function iconTint(accessory: Accessory): string | undefined {
  if (accessory.kind === "light" && accessory.state.on) return lightIconColor(accessory.state);
  return undefined;
}

export function AccessoryIcon({ accessory, size = 18 }: { accessory: Accessory; size?: number }) {
  const unit = useContext(UnitContext);
  if (accessory.kind === "sensor" && ["temperature", "humidity"].includes(accessory.sensor)) {
    return <span className="sensor-value">{sensorValue(accessory, unit)}</span>;
  }
  if (accessory.kind === "thermostat" && accessory.current !== null) {
    return <span className="sensor-value">{formatTemperature(accessory.current, unit)}</span>;
  }
  return <Icon name={accessoryIcon(accessory)} size={size} />;
}

export function AccessoryTile({
  accessory,
  onOpen,
  onToggle,
}: {
  accessory: Accessory;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const unit = useContext(UnitContext);
  if (accessory.kind === "camera") {
    return (
      <div className="tile camera" onClick={onOpen}>
        <div className="camera-feed" />
        <div className="camera-badge">
          <span className="live-dot" />
          {statusText(accessory, unit)}
        </div>
        <div className="camera-caption">
          <Icon name="doorbell" size={14} />
          <span>{accessory.name}</span>
        </div>
      </div>
    );
  }
  const active = isActive(accessory);
  const tint = iconTint(accessory);
  const classes = ["tile", active && "on", !accessory.reachable && "unreachable", accessory.kind].filter(Boolean).join(" ");
  return (
    <div className={classes} onClick={onOpen}>
      <button
        className="tile-icon"
        style={tint ? ({ "--tint": tint } as CSSProperties) : undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (toggleable(accessory)) onToggle();
          else onOpen();
        }}
      >
        <AccessoryIcon accessory={accessory} />
      </button>
      <div className="tile-text">
        <span className="tile-name">{accessory.name}</span>
        <span className="tile-status">{statusText(accessory, unit)}</span>
      </div>
    </div>
  );
}

export const sceneIcons: Record<Scene["type"], IconName> = {
  arrival: "arrive",
  departure: "leave",
  wakeUp: "sun",
  sleep: "moon",
  custom: "sparkles",
};

export function SceneTile({ scene, onRun, onMenu }: { scene: Scene; onRun: () => void; onMenu?: (x: number, y: number) => void }) {
  return (
    <button
      className="tile scene"
      onClick={onRun}
      onContextMenu={(e) => {
        if (!onMenu) return;
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
    >
      <span className={`tile-icon scene-${scene.type}`}>
        <Icon name={sceneIcons[scene.type]} size={17} />
      </span>
      <div className="tile-text">
        <span className="tile-name">{scene.name}</span>
      </div>
    </button>
  );
}

export function AddTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="tile add-tile" onClick={onClick}>
      <span className="tile-icon">
        <Icon name="plus" size={16} />
      </span>
      <div className="tile-text">
        <span className="tile-name">{label}</span>
      </div>
    </button>
  );
}
