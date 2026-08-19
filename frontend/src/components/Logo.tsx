/**
 * Custom SVG logo for Enterprise AI Knowledge System.
 * Combines brain/neural + document + spark elements.
 */
export function Logo({ size = 56, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Enterprise AI logo"
    >
      {/* Background rounded square */}
      <rect width="56" height="56" rx="14" fill="url(#logo-bg)" />

      {/* Brain / neural network shape */}
      <path
        d="M28 12C20.268 12 14 18.268 14 26c0 4.8 2.4 9 6 11.4V42a2 2 0 002 2h16a2 2 0 002-2v-4.6c3.6-2.4 6-6.6 6-11.4 0-7.732-6.268-14-14-14z"
        fill="rgba(255,255,255,.12)"
        stroke="rgba(255,255,255,.2)"
        strokeWidth="1"
      />

      {/* Neural nodes */}
      <circle cx="22" cy="23" r="2.5" fill="#ff7043" />
      <circle cx="34" cy="23" r="2.5" fill="#ff7043" />
      <circle cx="28" cy="30" r="2.5" fill="#ff9a76" />
      <circle cx="22" cy="35" r="2" fill="#ffb896" opacity=".7" />
      <circle cx="34" cy="35" r="2" fill="#ffb896" opacity=".7" />

      {/* Neural connections */}
      <line x1="22" y1="23" x2="34" y2="23" stroke="rgba(255,112,67,.4)" strokeWidth="1" />
      <line x1="22" y1="23" x2="28" y2="30" stroke="rgba(255,112,67,.4)" strokeWidth="1" />
      <line x1="34" y1="23" x2="28" y2="30" stroke="rgba(255,112,67,.4)" strokeWidth="1" />
      <line x1="28" y1="30" x2="22" y2="35" stroke="rgba(255,112,67,.3)" strokeWidth="1" />
      <line x1="28" y1="30" x2="34" y2="35" stroke="rgba(255,112,67,.3)" strokeWidth="1" />

      {/* Document icon at bottom */}
      <rect x="23" y="40" width="10" height="8" rx="1.5" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.25)" strokeWidth=".75" />
      <line x1="25.5" y1="42.5" x2="30.5" y2="42.5" stroke="rgba(255,255,255,.35)" strokeWidth=".75" strokeLinecap="round" />
      <line x1="25.5" y1="44.5" x2="29" y2="44.5" stroke="rgba(255,255,255,.25)" strokeWidth=".75" strokeLinecap="round" />
      <line x1="25.5" y1="46.5" x2="28" y2="46.5" stroke="rgba(255,255,255,.2)" strokeWidth=".75" strokeLinecap="round" />

      {/* Sparkle accents */}
      <path d="M42 14l1.5 3 3 1.5-3 1.5L42 23l-1.5-3-3-1.5 3-1.5z" fill="#ff7043" opacity=".8" />
      <path d="M13 18l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="#ff9a76" opacity=".5" />

      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b2a1e" />
          <stop offset=".5" stopColor="#2a2520" />
          <stop offset="1" stopColor="#1d1d1b" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/**
 * Smaller logo variant for sidebar / form header.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Enterprise AI"
    >
      <rect width="32" height="32" rx="8" fill="url(#mark-bg)" />
      <circle cx="12" cy="13" r="2" fill="#ff7043" />
      <circle cx="20" cy="13" r="2" fill="#ff7043" />
      <circle cx="16" cy="18" r="2" fill="#ff9a76" />
      <line x1="12" y1="13" x2="20" y2="13" stroke="rgba(255,112,67,.5)" strokeWidth=".75" />
      <line x1="12" y1="13" x2="16" y2="18" stroke="rgba(255,112,67,.5)" strokeWidth=".75" />
      <line x1="20" y1="13" x2="16" y2="18" stroke="rgba(255,112,67,.5)" strokeWidth=".75" />
      <rect x="11" y="22" width="10" height="6" rx="1.5" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.2)" strokeWidth=".5" />
      <line x1="13" y1="24" x2="19" y2="24" stroke="rgba(255,255,255,.3)" strokeWidth=".5" strokeLinecap="round" />
      <line x1="13" y1="26" x2="17" y2="26" stroke="rgba(255,255,255,.2)" strokeWidth=".5" strokeLinecap="round" />
      <defs>
        <linearGradient id="mark-bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff7043" />
          <stop offset="1" stopColor="#e95d31" />
        </linearGradient>
      </defs>
    </svg>
  )
}
