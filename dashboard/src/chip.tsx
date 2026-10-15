import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';

/**
 * A badge that explains itself. Native `title` tooltips never show on touch or keyboard focus, so the explanation
 * opens on mouse hover, keyboard focus, or a tap/click (which pins it); Escape, a tap elsewhere or leaving closes it.
 * The text is always in the DOM (hidden when closed) and linked with aria-describedby, so screen readers read it on
 * focus. It is position: fixed, so the table's scroll container cannot clip it.
 */
export function Chip({ tone, label, help }: { tone?: 'info' | 'warn' | 'ok'; label: ReactNode; help: ReactNode }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const fromPointer = useRef(false);
  const overTip = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || focus || pinned;

  const close = () => { setHover(false); setFocus(false); setPinned(false); };
  const enter = (e: RPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(leaveTimer.current);
    setHover(true);
  };
  // A short delay lets the pointer move from the chip onto the explanation without it closing (WCAG 1.4.13).
  const leave = (e: RPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setHover(false), 150);
  };
  useEffect(() => {
    return () => clearTimeout(leaveTimer.current);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = btn.current, t = tip.current;
      if (!b || !t) return;
      const r = b.getBoundingClientRect();
      const w = t.offsetWidth, h = t.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
      const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, 8), Math.max(8, vw - w - 8));
      const below = r.bottom + 6;
      t.style.left = `${left}px`;
      t.style.top = `${below + h > vh - 8 && r.top - h - 6 > 8 ? r.top - h - 6 : below}px`;
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node | null;
      if (n && (btn.current?.contains(n) || tip.current?.contains(n))) return;
      setPinned(false);
      setHover(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`badge chip${tone ? ` ${tone}` : ''}`}
        aria-describedby={id}
        aria-expanded={open}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onPointerDown={() => { fromPointer.current = true; }}
        // Focus from a click or tap is handled by onClick; only keyboard focus opens it here.
        onFocus={() => { if (!fromPointer.current) setFocus(true); }}
        onBlur={() => { fromPointer.current = false; setFocus(false); if (!overTip.current) setPinned(false); }}
        onClick={() => { fromPointer.current = false; setPinned((p) => !p); }}
      >{label}</button>
      <span
        ref={tip}
        id={id}
        role="tooltip"
        className="chip-tip"
        hidden={!open}
        onPointerEnter={(e) => { overTip.current = true; enter(e); }}
        onPointerLeave={(e) => { overTip.current = false; leave(e); }}
      >{help}</span>
    </>
  );
}
