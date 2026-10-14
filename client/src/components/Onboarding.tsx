import { AppIcon } from "./AppIcon";
import { WindowControls } from "./WindowControls";

export function Onboarding({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="app onboarding" data-tauri-drag-region>
      <WindowControls />
      <div className="onboarding-card">
        <AppIcon size={96} />
        <h1 className="onboarding-title">Welcome to RyHome</h1>
        <p className="onboarding-sub">
          Your smart home, right here on Windows.
          <br />
          Controlling real accessories needs the desktop app, but you can look around here.
        </p>
        <div className="onboarding-actions">
          <button className="glass-button primary wide" onClick={onDemo}>
            Try the Demo
          </button>
        </div>
      </div>
    </div>
  );
}
