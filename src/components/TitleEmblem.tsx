export function TitleEmblem() {
  return (
    <div className="flex items-center gap-3.5 select-none">
      <svg
        width="54"
        height="54"
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="2"
          y="2"
          width="60"
          height="60"
          rx="14"
          fill="#0F3B68"
          stroke="#F8FAFC"
          strokeOpacity="0.28"
          strokeWidth="2"
        />
        <line
          x1="32"
          y1="8"
          x2="32"
          y2="56"
          stroke="#F8FAFC"
          strokeOpacity="0.22"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        <g transform="translate(27 33) rotate(-32)">
          <rect x="-3" y="10" width="6" height="14" rx="2" fill="#D4A373" />
          <ellipse cx="0" cy="-2" rx="13" ry="14" fill="#1E293B" />
          <ellipse
            cx="0"
            cy="-2.5"
            rx="12"
            ry="13"
            fill="#D93829"
            stroke="#F8FAFC"
            strokeOpacity="0.4"
            strokeWidth="1"
          />
          <path
            d="M -6 -8 A 9 9 0 0 1 5 -10"
            stroke="#FFFFFF"
            strokeOpacity="0.45"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </g>
        <path
          d="M 38 22 Q 46 16 51 19"
          stroke="#F59E0B"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="2.5 2.5"
        />
        <circle cx="49" cy="18" r="5.5" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1" />
      </svg>
      <div className="min-w-0">
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight leading-none text-slate-50">
          SPINCOURT
        </h1>
        <p className="text-xs sm:text-sm font-medium text-slate-300 mt-1 whitespace-nowrap">
          Solo AI · Wi-Fi Multiplayer
        </p>
      </div>
    </div>
  );
}
