/** The ccmeter wordmark: type only, no symbol. "cc" in the accent colour, "meter" in the text colour. */
export function Brand() {
  return (
    <a className="brand" href="#/" aria-label="ccmeter, home">
      <span className="brand-name">
        <span className="brand-cc">cc</span>meter
      </span>
    </a>
  );
}
