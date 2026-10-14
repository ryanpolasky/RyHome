export function AppIcon({ size }: { size: number }) {
  return (
    <svg className="app-icon" width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <linearGradient id="app-icon-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ececec" />
        </linearGradient>
        <linearGradient id="app-icon-house" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb340" />
          <stop offset="1" stopColor="#f7722f" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="230" fill="url(#app-icon-bg)" />
      <path
        fill="url(#app-icon-house)"
        d="M512 190 680 330V262q0-12 12-12h36q12 0 12 12v118l106 79c22 18 9 51-18 51h-56v258c0 33-27 60-60 60H586V660q0-20-20-20H458q-20 0-20 20v168H312c-33 0-60-27-60-60V510h-56c-27 0-40-33-18-51z"
      />
    </svg>
  );
}
