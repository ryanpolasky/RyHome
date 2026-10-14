import { isDesktop, windowControls } from "../desktop";
import { CaptionGlyph } from "./Icon";

export function WindowControls() {
  if (!isDesktop) return null;
  return (
    <div className="window-controls">
      <button aria-label="Minimize" onClick={windowControls.minimize}>
        <CaptionGlyph kind="minimize" />
      </button>
      <button aria-label="Maximize" onClick={windowControls.toggleMaximize}>
        <CaptionGlyph kind="maximize" />
      </button>
      <button aria-label="Close" className="close" onClick={windowControls.close}>
        <CaptionGlyph kind="close" />
      </button>
    </div>
  );
}
