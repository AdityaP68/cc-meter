/** The agent-lens mark: a lens ring around three usage bars, in the chart palette. Decorative; the name beside it labels it. */
export function LensMark({ size = 24 }: { size?: number }) {
  return (
    <svg className="lens-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="lens-ring" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'var(--series-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--series-7)' }} />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="13" fill="none" stroke="url(#lens-ring)" strokeWidth="3" />
      <rect x="9.5" y="16" width="3.4" height="6" rx="1.2" style={{ fill: 'var(--series-1)' }} />
      <rect x="14.3" y="10.5" width="3.4" height="11.5" rx="1.2" style={{ fill: 'var(--series-2)' }} />
      <rect x="19.1" y="13.5" width="3.4" height="8.5" rx="1.2" style={{ fill: 'var(--series-3)' }} />
      <path d="M7.2 11.2a10 10 0 0 1 5-4.4" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Brand() {
  return (
    <a className="brand" href="#/" aria-label="agent-lens, home">
      <LensMark />
      <span className="brand-name">agent-lens</span>
    </a>
  );
}
