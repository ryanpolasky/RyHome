import { useState } from "react";
import type { Connection } from "../connection";
import { parsePairingCode, saveConnection, testConnection } from "../connection";
import { AppIcon } from "./AppIcon";
import { WindowControls } from "./WindowControls";

export function Onboarding({ onConnected }: { onConnected: (connection: Connection) => void }) {
  const [step, setStep] = useState<"welcome" | "pair">("welcome");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    setBusy(true);
    try {
      const target = parsePairingCode(code);
      await testConnection(target.url, target.token);
      const connection: Connection = { mode: "remote", ...target };
      saveConnection(connection);
      onConnected(connection);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }

  function startDemo() {
    const connection: Connection = { mode: "demo" };
    saveConnection(connection);
    onConnected(connection);
  }

  return (
    <div className="app onboarding" data-tauri-drag-region>
      <WindowControls />
      {step === "welcome" ? (
        <div className="onboarding-card" key="welcome">
          <AppIcon size={96} />
          <h1 className="onboarding-title">Welcome to RyHome</h1>
          <p className="onboarding-sub">
            Your smart home, right here on Windows.
            <br />
            Your Mac does the talking.
          </p>
          <div className="onboarding-actions">
            <button className="glass-button primary wide" onClick={() => setStep("pair")}>
              Continue
            </button>
            <button className="link-button" onClick={startDemo}>
              Try the Demo
            </button>
          </div>
        </div>
      ) : (
        <div className="onboarding-card" key="pair">
          <AppIcon size={64} />
          <h1 className="onboarding-title small">Connect to Your Mac</h1>
          <p className="onboarding-sub">Run the RyHome server on your Mac, then paste the pairing code it prints.</p>
          <textarea
            className="code-input pairing"
            placeholder="RYH1..."
            rows={3}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy}
            spellCheck={false}
          />
          <p className={`settings-error ${error ? "visible" : ""}`}>{error ?? "\u00a0"}</p>
          <div className="onboarding-actions">
            <button className="glass-button primary wide" onClick={connect} disabled={busy || !code.trim()}>
              {busy ? "Connecting..." : "Connect"}
            </button>
            <button
              className="link-button"
              onClick={() => {
                setStep("welcome");
                setError(null);
              }}
              disabled={busy}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
