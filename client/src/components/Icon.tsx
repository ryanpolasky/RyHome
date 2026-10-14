import type { ReactNode } from "react";

const stroke = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

const glyphs = {
  house: <path d="M12 3.2 2.5 11.1a.9.9 0 0 0 1.15 1.38L5 11.35V20a1 1 0 0 0 1 1h4.5v-6h3v6H18a1 1 0 0 0 1-1v-8.65l1.35 1.13a.9.9 0 0 0 1.15-1.38z" />,
  bulb: <path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2zm-3 17.5h6v.5a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />,
  fan: (
    <g>
      <circle cx="12" cy="12" r="2.2" />
      {[0, 90, 180, 270].map((deg) => (
        <path key={deg} transform={`rotate(${deg} 12 12)`} d="M12.6 9.9C12 6.5 12.8 3 15.6 2.6c2.6-.4 3.4 2.8 1.4 4.8-1.2 1.2-2.7 1.8-4.4 2.5z" />
      ))}
    </g>
  ),
  media: (
    <g>
      <rect x="1.5" y="4" width="15" height="10.5" rx="1.6" />
      <rect x="6" y="16" width="6" height="1.8" rx=".9" />
      <rect x="17.8" y="7" width="4.7" height="12" rx="1.4" />
    </g>
  ),
  lock: <path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z" />,
  room: (
    <g {...stroke} strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 20.5v-7a1 1 0 0 1 1-1h4" />
    </g>
  ),
  ceiling: <path d="M11 2h2v5h-2zM3.5 15a8.5 7.5 0 0 1 17 0zM9 16.5h6a3 3 0 0 1-6 0z" />,
  floorLamp: <path d="M8 2h8l3 7.5H5zM11 9.5h2V20h-2zM7 20h10a1 1 0 0 1 1 1v1H6v-1a1 1 0 0 1 1-1z" />,
  tableLamp: <path d="M7 3h10l3 8.5H4zM11 11.5h2V17h-2zM6 17h12a1 1 0 0 1 1 1v2.5H5V18a1 1 0 0 1 1-1z" />,
  lightstrip: (
    <path {...stroke} strokeWidth="3" d="M3 7c3-3 6 3 9 0s6-3 9 0M3 13c3-3 6 3 9 0s6-3 9 0M3 19c3-3 6 3 9 0s6-3 9 0" />
  ),
  appleTv: (
    <g>
      <rect x="3" y="8" width="18" height="8" rx="2.5" />
    </g>
  ),
  homepod: <path d="M6.5 6h11a6.5 6.5 0 0 1-11 0zM4 9.5h16a8 8 0 0 1-16 0z" />,
  thermometer: <path d="M9.5 4.5a2.5 2.5 0 0 1 5 0v8.6a4.5 4.5 0 1 1-5 0zM11 14v-6h2v6a2 2 0 1 1-2 0z" fillRule="evenodd" />,
  drop: <path d="M12 2.5s-6.5 7-6.5 11.5a6.5 6.5 0 0 0 13 0C18.5 9.5 12 2.5 12 2.5z" />,
  doorbell: (
    <path
      fillRule="evenodd"
      d="M8.5 2h7A2.5 2.5 0 0 1 18 4.5v15a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 19.5v-15A2.5 2.5 0 0 1 8.5 2zM12 5.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm0 7.3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
    />
  ),
  sun: (
    <g>
      <circle cx="12" cy="12" r="4.2" />
      <g {...stroke} strokeWidth="2">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <path key={deg} transform={`rotate(${deg} 12 12)`} d="M12 2.5v2.2" />
        ))}
      </g>
    </g>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />,
  arrive: <path d="M10 3h9v18h-9v-4h2v2h5V5h-5v2h-2zM9 7.5l5 4.5-5 4.5v-3.4H3v-2.2h6z" />,
  leave: <path d="M5 3h9v4h-2V5H7v14h5v-2h2v4H5zM15 7.5l5 4.5-5 4.5v-3.4H9v-2.2h6z" />,
  chevronDown: <path {...stroke} strokeWidth="2.2" d="m6 9 6 6 6-6" />,
  chevronRight: <path {...stroke} strokeWidth="2.6" d="m9 5 7 7-7 7" />,
  ellipsis: (
    <g>
      <circle cx="5.5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="18.5" cy="12" r="1.9" />
    </g>
  ),
  close: <path {...stroke} strokeWidth="2.4" d="M7 7l10 10M17 7 7 17" />,
  check: <path {...stroke} strokeWidth="3" d="m5 12.5 4.5 4.5L19 7.5" />,
  group: (
    <g>
      <rect x="2.5" y="3" width="8.5" height="8.5" rx="2.2" />
      <rect x="13" y="3" width="8.5" height="8.5" rx="2.2" />
      <rect x="2.5" y="13.5" width="8.5" height="8.5" rx="2.2" />
      <rect x="13" y="13.5" width="8.5" height="8.5" rx="2.2" />
    </g>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof glyphs;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {glyphs[name]}
    </svg>
  );
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
