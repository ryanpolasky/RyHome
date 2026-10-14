import type { ReactNode } from "react";
import { useState } from "react";
import type { Home } from "../api/types";
import type { View } from "../home";
import { categories, categoryOf } from "../home";
import type { IconName } from "./Icon";
import { Icon } from "./Icon";

export const categoryIcons: Record<string, IconName> = {
  climate: "fan",
  lights: "bulb",
  security: "lock",
  media: "media",
};

function sameView(a: View, b: View): boolean {
  return a.type === b.type && (a.type === "home" || a.id === (b as typeof a).id);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="sidebar-section">
      <button className="sidebar-heading" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <Icon name="chevronDown" size={13} className={open ? "" : "collapsed"} />
      </button>
      {open && children}
    </div>
  );
}

export function Sidebar({ home, view, onNavigate }: { home: Home; view: View; onNavigate: (view: View) => void }) {
  const item = (target: View, icon: IconName, label: string) => (
    <button
      key={label}
      className={`sidebar-item ${sameView(view, target) ? "selected" : ""}`}
      onClick={() => onNavigate(target)}
    >
      <Icon name={icon} size={17} />
      <span>{label}</span>
    </button>
  );
  const present = categories.filter((c) => home.accessories.some((a) => categoryOf(a) === c.id));

  return (
    <nav className="sidebar">
      <div className="sidebar-drag" data-tauri-drag-region />
      <div className="sidebar-scroll">
        {item({ type: "home" }, "house", home.name)}
        {present.length > 0 && (
          <Section title="Categories">
            {present.map((c) => item({ type: "category", id: c.id }, categoryIcons[c.id], c.name))}
          </Section>
        )}
        {home.rooms.length > 0 && (
          <Section title="Rooms">
            {[...home.rooms]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((r) => item({ type: "room", id: r.id }, "room", r.name))}
          </Section>
        )}
      </div>
    </nav>
  );
}
