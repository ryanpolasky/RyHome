import type { CSSProperties, ReactNode } from "react";
import { useEffect } from "react";
import { Icon } from "./Icon";

export function Sheet({
  icon,
  tint,
  title,
  status,
  onClose,
  footer,
  form,
  children,
}: {
  icon: ReactNode;
  tint?: string;
  title: string;
  status?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  form?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={form ? undefined : onClose}>
      <div className="sheet-header" onClick={(e) => e.stopPropagation()}>
        <span className={`sheet-icon ${tint ? "on" : ""}`} style={tint ? ({ "--tint": tint } as CSSProperties) : undefined}>
          {icon}
        </span>
        <div>
          <div className="sheet-title">{title}</div>
          {status && <div className="sheet-status">{status}</div>}
        </div>
      </div>
      <button className="sheet-close" aria-label="Close" onClick={onClose}>
        <Icon name="close" size={14} />
      </button>
      <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
      {footer && (
        <div className="sheet-footer" onClick={(e) => e.stopPropagation()}>
          {footer}
        </div>
      )}
    </div>
  );
}
