import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

export function MoreMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="more" ref={ref}>
      <button className="more-button" aria-label="More" onClick={() => setOpen(!open)}>
        <Icon name="ellipsis" size={16} />
      </button>
      {open && (
        <div className="menu">
          {items.map((item) => (
            <button
              key={item.label}
              className={`menu-item ${item.destructive ? "destructive" : ""}`}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
