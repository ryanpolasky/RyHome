import type { CSSProperties } from "react";
import { useState } from "react";
import type { RyHomeBridge } from "../api/bridge";
import type { LightAccessory, LightState, Room, Scene } from "../api/types";
import { lightColor } from "../home";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { accessoryIcon, sceneIcons } from "./Tile";

const sceneTypes: Scene["type"][] = ["custom", "arrival", "departure", "wakeUp", "sleep"];

export function captureState(light: LightAccessory): Partial<LightState> {
  if (!light.state.on) return { on: false };
  const { on, brightness, colorMode, hue, saturation, colorTemperature } = light.state;
  const color = colorMode === "hs" ? { colorMode, hue, saturation } : { colorMode, colorTemperature };
  return { on, ...(light.supports.brightness ? { brightness } : {}), ...(light.supports.color || light.supports.temperature ? color : {}) };
}

export function SceneEditor({
  bridge,
  lights,
  rooms,
  scene,
  onClose,
}: {
  bridge: RyHomeBridge;
  lights: LightAccessory[];
  rooms: Room[];
  scene?: Scene;
  onClose: () => void;
}) {
  const choices = lights.filter((l) => !l.groupId);
  const [name, setName] = useState(scene?.name ?? "");
  const [type, setType] = useState<Scene["type"]>(scene?.type ?? "custom");
  const [actions, setActions] = useState<Record<string, Partial<LightState>>>(() =>
    scene
      ? Object.fromEntries(scene.actions.map((a) => [a.accessoryId, a.state]))
      : Object.fromEntries(choices.filter((l) => l.state.on).map((l) => [l.id, captureState(l)]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? "";

  const toggle = (light: LightAccessory) =>
    setActions((all) => {
      const next = { ...all };
      if (next[light.id]) delete next[light.id];
      else next[light.id] = captureState(light);
      return next;
    });
  const patch = (id: string, change: Partial<LightState>) => setActions((all) => ({ ...all, [id]: { ...all[id], ...change } }));

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const input = { name: name.trim(), type, actions: Object.entries(actions).map(([accessoryId, state]) => ({ accessoryId, state })) };
      if (scene) await bridge.updateScene(scene.id, input);
      else await bridge.createScene(input);
    });

  return (
    <Sheet icon={<Icon name={sceneIcons[type]} size={20} />} title={scene ? "Edit Scene" : "New Scene"} onClose={busy ? () => {} : onClose}>
      <div className="settings-panel scene-editor">
        <label className="settings-row">
          <span>Name</span>
          <input className="settings-input" placeholder="Movie Night" value={name} autoFocus={!scene} disabled={busy} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="settings-row">
          <span>Icon</span>
          <div className="icon-choices">
            {sceneTypes.map((t) => (
              <button key={t} aria-label={t} className={`icon-choice ${type === t ? "selected" : ""}`} disabled={busy} onClick={() => setType(t)}>
                <Icon name={sceneIcons[t]} size={16} />
              </button>
            ))}
          </div>
        </div>
        <div className="member-list scene-lights">
          {choices.map((light) => {
            const state = actions[light.id];
            const included = !!state;
            return (
              <div key={light.id} className={`scene-light ${included ? "checked" : ""}`}>
                <button className="member-choice" disabled={busy} onClick={() => toggle(light)}>
                  <span className="member-check">{included && <Icon name="check" size={12} />}</span>
                  <Icon name={accessoryIcon(light)} size={16} />
                  <span className="member-name">{light.name}</span>
                  {!included && <span className="member-room">{roomName(light.roomId)}</span>}
                </button>
                {included && (
                  <div className="scene-light-controls">
                    <div className="segmented small">
                      <button className={state.on !== false ? "selected" : ""} onClick={() => patch(light.id, captureState({ ...light, state: { ...light.state, on: true } }))}>
                        On
                      </button>
                      <button className={state.on === false ? "selected" : ""} onClick={() => setActions((all) => ({ ...all, [light.id]: { on: false } }))}>
                        Off
                      </button>
                    </div>
                    {state.on !== false && light.supports.brightness && (
                      <span className="brightness-entry">
                        <input
                          inputMode="numeric"
                          value={state.brightness ?? 100}
                          onChange={(e) => patch(light.id, { brightness: Math.min(100, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)) })}
                        />
                        %
                      </span>
                    )}
                    {state.on !== false && state.colorMode && (
                      <span
                        className="scene-swatch"
                        title="Color"
                        style={{ "--swatch": lightColor({ ...light.state, ...state } as LightState) } as CSSProperties}
                      />
                    )}
                    <button className="link-button" title="Use how this light looks right now" onClick={() => patch(light.id, captureState(light))}>
                      Use Current
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="add-hint">Lights start with how they look right now. Set them up first, or use "Use Current" after changing one.</p>
        <p className={`settings-error ${error ? "visible" : ""}`}>{error ?? "\u00a0"}</p>
        <div className="settings-actions">
          {scene &&
            (confirmDelete ? (
              <button className="glass-button destructive" disabled={busy} onClick={() => run(() => bridge.deleteScene(scene.id))}>
                Delete Scene?
              </button>
            ) : (
              <button className="glass-button destructive" disabled={busy} onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            ))}
          <button className="glass-button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="glass-button primary" disabled={busy || !name.trim() || Object.keys(actions).length === 0} onClick={save}>
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
