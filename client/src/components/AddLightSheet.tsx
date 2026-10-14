import { useEffect, useState } from "react";
import type { RyHomeBridge } from "../api/bridge";
import type { Accessory, HomeKitCandidate } from "../api/types";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

type Step = { name: "choose" } | { name: "code"; candidate: HomeKitCandidate | null } | { name: "done"; added: Accessory[] };

export function AddLightSheet({ bridge, onClose }: { bridge: RyHomeBridge; onClose: () => void }) {
  const [step, setStep] = useState<Step>({ name: "choose" });
  const [candidates, setCandidates] = useState<HomeKitCandidate[] | null>(null);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bridge.getHomeKitAccessories().then(
      (list) => setCandidates(list.filter((c) => !c.linkedNodeId)),
      (e) => {
        setCandidateError((e as Error).message);
        setStep({ name: "code", candidate: null });
      }
    );
  }, [bridge]);

  async function pair(candidate: HomeKitCandidate | null) {
    setBusy(true);
    setError(null);
    try {
      const result = await bridge.commission(code, candidate?.id ?? null);
      setStep({ name: "done", added: result.accessories });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const close = busy ? () => {} : onClose;
  return (
    <Sheet icon={<Icon name="bulb" size={20} />} title="Add Light" status="Matter lights from the Home app" onClose={close}>
      {step.name === "choose" && (
        <div className="add-panel">
          <p className="add-lead">Which light from the Home app do you want to add?</p>
          {!candidates ? (
            <p className="add-hint">Loading your Home app accessories...</p>
          ) : candidates.length === 0 ? (
            <p className="add-hint">Every Matter accessory in the Home app is already added.</p>
          ) : (
            <div className="candidate-list">
              {candidates.map((c) => (
                <button key={c.id} className="candidate" onClick={() => setStep({ name: "code", candidate: c })}>
                  <span className="candidate-name">{c.name}</span>
                  <span className="candidate-room">{[c.room, c.model].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </div>
          )}
          <button className="link-button" onClick={() => setStep({ name: "code", candidate: null })}>
            It's not listed
          </button>
        </div>
      )}
      {step.name === "code" && (
        <div className="add-panel">
          <ol className="add-steps">
            <li>
              In the Home app, open <strong>{step.candidate?.name ?? "the light"}</strong> and go to its settings.
            </li>
            <li>
              Tap <strong>Turn On Pairing Mode</strong>. The light stays in the Home app.
            </li>
            <li>Type the setup code it shows below.</li>
          </ol>
          <input
            className="code-input"
            placeholder="1234-567-8901"
            value={code}
            autoFocus
            disabled={busy}
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && code.trim() && !busy && pair(step.candidate)}
          />
          {candidateError && <p className="add-hint">{candidateError} The light will use its built-in name.</p>}
          <p className={`settings-error ${error ? "visible" : ""}`}>{error ?? "\u00a0"}</p>
          <div className="settings-actions">
            {candidates && (
              <button className="glass-button" disabled={busy} onClick={() => setStep({ name: "choose" })}>
                Back
              </button>
            )}
            <button className="glass-button primary" disabled={busy || !code.trim()} onClick={() => pair(step.candidate)}>
              {busy ? "Pairing..." : "Add Light"}
            </button>
          </div>
          {busy && <p className="add-hint">This can take up to a minute.</p>}
        </div>
      )}
      {step.name === "done" && (
        <div className="add-panel">
          <p className="add-lead">
            {step.added.length > 0 ? `Added ${step.added.map((a) => a.name).join(", ")}.` : "Paired, but it didn't report any lights."}
          </p>
          <button className="glass-button primary" onClick={onClose}>
            Done
          </button>
        </div>
      )}
    </Sheet>
  );
}
