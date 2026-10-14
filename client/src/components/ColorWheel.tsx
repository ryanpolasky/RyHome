import type { CSSProperties, PointerEvent } from "react";
import { useRef } from "react";
import type { LightState } from "../api/types";
import { lightColor } from "../home";

const MIRED_COOL = 153;
const MIRED_WARM = 500;

function track(e: PointerEvent<HTMLDivElement>, onMove: (x: number, y: number, rect: DOMRect) => void) {
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);
  const move = (ev: { clientX: number; clientY: number }) => onMove(ev.clientX, ev.clientY, el.getBoundingClientRect());
  move(e);
  const onPointerMove = (ev: globalThis.PointerEvent) => move(ev);
  const stop = () => {
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", stop);
    el.removeEventListener("pointercancel", stop);
  };
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointercancel", stop);
}

export function ColorWheel({
  state,
  color,
  temperature,
  disabled,
  onChange,
}: {
  state: LightState;
  color: boolean;
  temperature: boolean;
  disabled?: boolean;
  onChange: (patch: Partial<LightState>) => void;
}) {
  const last = useRef("");
  const send = (patch: Partial<LightState>) => {
    const key = JSON.stringify(patch);
    if (key === last.current) return;
    last.current = key;
    onChange({ ...patch, on: true });
  };

  const hsActive = state.colorMode === "hs";
  const angle = (state.hue * Math.PI) / 180;
  const radius = (Math.min(100, state.saturation) / 100) * 50;
  const temp = Math.min(1, Math.max(0, (state.colorTemperature - MIRED_COOL) / (MIRED_WARM - MIRED_COOL)));

  return (
    <div className={`color-picker ${disabled ? "disabled" : ""}`}>
      {color && (
        <div
          className="color-wheel"
          onPointerDown={(e) =>
            !disabled &&
            track(e, (x, y, rect) => {
              const dx = x - (rect.left + rect.width / 2);
              const dy = y - (rect.top + rect.height / 2);
              const hue = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);
              const saturation = Math.round(Math.min(1, Math.hypot(dx, dy) / (rect.width / 2)) * 100);
              send({ colorMode: "hs", hue, saturation });
            })
          }
        >
          {hsActive && (
            <span
              className="color-marker"
              style={
                {
                  left: `${50 + radius * Math.sin(angle)}%`,
                  top: `${50 - radius * Math.cos(angle)}%`,
                  "--marker": lightColor(state),
                } as CSSProperties
              }
            />
          )}
        </div>
      )}
      {temperature && (
        <div
          className="temperature-bar"
          onPointerDown={(e) =>
            !disabled &&
            track(e, (x, _, rect) => {
              const t = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
              send({ colorMode: "temperature", colorTemperature: Math.round(MIRED_COOL + t * (MIRED_WARM - MIRED_COOL)) });
            })
          }
        >
          {!hsActive && (
            <span className="color-marker" style={{ left: `${temp * 100}%`, top: "50%", "--marker": lightColor(state) } as CSSProperties} />
          )}
        </div>
      )}
    </div>
  );
}
