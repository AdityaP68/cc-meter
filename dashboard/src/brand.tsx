/** The ccmeter mark: a plain ring around three usage bars. Decorative; the name beside it labels it. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="13" fill="none" style={{ stroke: 'var(--text-primary)' }} strokeWidth="2.5" />
      <rect x="9.5" y="16" width="3.4" height="6" rx="1.2" style={{ fill: 'var(--series-2)' }} />
      <rect x="14.3" y="10.5" width="3.4" height="11.5" rx="1.2" style={{ fill: 'var(--series-1)' }} />
      <rect x="19.1" y="13.5" width="3.4" height="8.5" rx="1.2" style={{ fill: 'var(--series-3)' }} />
    </svg>
  );
}

export function Brand() {
  return (
    <a className="brand" href="#/" aria-label="ccmeter, home">
      <BrandMark />
      <span className="brand-name">ccmeter</span>
    </a>
  );
}
