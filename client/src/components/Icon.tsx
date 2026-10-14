import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  DoorOpen,
  Droplet,
  Ellipsis,
  Fan,
  House,
  Lamp,
  LampCeiling,
  LampFloor,
  LayoutGrid,
  Lightbulb,
  Lock,
  LogIn,
  LogOut,
  MonitorSpeaker,
  Moon,
  Speaker,
  Sun,
  Thermometer,
  Tv,
  Waves,
  X,
} from "lucide-react";

const glyphs = {
  house: House,
  bulb: Lightbulb,
  fan: Fan,
  media: MonitorSpeaker,
  lock: Lock,
  room: DoorOpen,
  ceiling: LampCeiling,
  floorLamp: LampFloor,
  tableLamp: Lamp,
  lightstrip: Waves,
  appleTv: Tv,
  homepod: Speaker,
  thermometer: Thermometer,
  drop: Droplet,
  doorbell: Bell,
  sun: Sun,
  moon: Moon,
  arrive: LogIn,
  leave: LogOut,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  ellipsis: Ellipsis,
  close: X,
  check: Check,
  group: LayoutGrid,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof glyphs;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  const Glyph = glyphs[name];
  return <Glyph className={className} size={size} strokeWidth={size <= 14 ? 2.5 : 2.1} aria-hidden="true" />;
}

export function CaptionGlyph({ kind }: { kind: "minimize" | "maximize" | "close" }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
      {kind === "minimize" && <path d="M0 5.5h10" />}
      {kind === "maximize" && <rect x=".5" y=".5" width="9" height="9" />}
      {kind === "close" && <path d="M.5.5l9 9M9.5.5l-9 9" />}
    </svg>
  );
}
