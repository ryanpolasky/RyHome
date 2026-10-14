import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { RyHomeBridge } from "../api/bridge";
import type { Home } from "../api/types";
import { appVersion, getLaunchAtLogin, isDesktop, quitApp, setLaunchAtLogin } from "../desktop";
import type { Settings } from "../settings";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

function Switch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? "on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

function Row({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
  return (
    <div className="pref-row">
      <div className="pref-text">
        <span className="pref-label">{label}</span>
        {detail && <span className="pref-detail">{detail}</span>}
      </div>
      <div className="pref-control">{children}</div>
    </div>
  );
}

export function SettingsSheet({
  home,
  bridge,
  settings,
  onChange,
  onClose,
}: {
  home: Home;
  bridge: RyHomeBridge;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(home.name);
  const [launchAtLogin, setLaunchState] = useState<boolean | null>(null);
  const [version, setVersion] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    appVersion().then(setVersion, () => {});
    if (isDesktop) getLaunchAtLogin().then(setLaunchState, (e) => setError(`Couldn't read launch at login: ${e}`));
  }, []);

  const saveHome = (patch: { name?: string; temperatureUnit?: "C" | "F" }) =>
    bridge.updateHome(patch).catch((e) => setError((e as Error).message));

  async function toggleLaunchAtLogin(enabled: boolean) {
    setError(null);
    try {
      await setLaunchAtLogin(enabled);
      setLaunchState(await getLaunchAtLogin());
    } catch (e) {
      setError(`Couldn't change launch at login: ${e}`);
    }
  }

  return (
    <Sheet icon={<Icon name="settings" size={20} />} title="Settings" status={version && `RyHome ${version}`} onClose={onClose}>
      <div className="prefs">
        <h3 className="pref-section">Home</h3>
        <div className="pref-group">
          <Row label="Name">
            <input
              className="settings-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name.trim() !== home.name && saveHome({ name: name.trim() })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </Row>
          <Row label="Temperature">
            <div className="segmented">
              {(["F", "C"] as const).map((unit) => (
                <button
                  key={unit}
                  className={home.temperatureUnit === unit ? "selected" : ""}
                  onClick={() => unit !== home.temperatureUnit && saveHome({ temperatureUnit: unit })}
                >
                  °{unit}
                </button>
              ))}
            </div>
          </Row>
        </div>

        {isDesktop && (
          <>
            <h3 className="pref-section">Window</h3>
            <div className="pref-group">
              <Row label="Minimize to tray" detail="The minimize button hides RyHome to the tray.">
                <Switch label="Minimize to tray" checked={settings.minimizeToTray} onChange={(minimizeToTray) => onChange({ minimizeToTray })} />
              </Row>
              <Row label="Launch at login" detail="Starts hidden in the tray when you sign in to Windows.">
                <Switch
                  label="Launch at login"
                  checked={launchAtLogin === true}
                  disabled={launchAtLogin === null}
                  onChange={toggleLaunchAtLogin}
                />
              </Row>
            </div>
            <p className="pref-note">Closing the window keeps RyHome running in the tray so your lights stay in sync.</p>
            <button className="glass-button destructive pref-quit" onClick={() => quitApp()}>
              Quit RyHome
            </button>
          </>
        )}
        <p className={`settings-error ${error ? "visible" : ""}`}>{error ?? "\u00a0"}</p>
      </div>
    </Sheet>
  );
}
