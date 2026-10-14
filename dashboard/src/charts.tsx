import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DayModel, EventRow, Turn } from './api';
import { niceMax, shortModel, tok, usd, usdAxis, when } from './format';

/* ---------- model colours: color follows the entity (stable per model name), never its rank ---------- */
export const ModelColors = createContext<(model: string) => string>(() => 'var(--series-1)');

/** Known models keep a fixed slot forever; unknown models fill the remaining slots in alphabetical order. */
const KNOWN_SLOTS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-opus-5', 'claude-sonnet-5', 'claude-fable-5-1', 'claude-haiku-5-5', 'claude-fable-5'];
const undated = (m: string) => m.replace(/-\d{8}$/, '');

export function makeModelColors(models: string[]): (model: string) => string {
  const extra = [...new Set(models.map(undated))].filter((m) => !KNOWN_SLOTS.includes(m)).sort();
  const slotOf = (m: string): number => {
    const u = undated(m);
    const k = KNOWN_SLOTS.indexOf(u);
    if (k >= 0) return k;
    const free = 8 - KNOWN_SLOTS.length; // 0 today: every slot is claimed, so unknown models share the neutral colour
    const e = extra.indexOf(u);
    return e >= 0 && e < free ? KNOWN_SLOTS.length + e : -1;
  };
  return (m) => {
    const i = slotOf(m);
    return i >= 0 ? `var(--series-${i + 1})` : 'var(--series-other)';
  };
}

/** Callback-ref based so the observer attaches whenever the element mounts (charts render an empty state first). */
export function useWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!el) return;
    setW(Math.max(280, Math.floor(el.getBoundingClientRect().width)));
    const ro = new ResizeObserver((e) => setW(Math.max(280, Math.floor(e[0]!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

interface TipState { x: number; y: number; title: string; rows: [string, string, string?][] }

function Tip({ tip, width }: { tip: TipState | null; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x + 12, 4), width - 220);
  return (
    <div className="tip" style={{ left, top: Math.max(tip.y - 8, 0) }} role="status">
      <div className="tip-title">{tip.title}</div>
      {tip.rows.map(([k, v, c], i) => (
        <div className="tip-row" key={i}>
          <span>{c ? <i className="swatch" style={{ background: c }} /> : null}{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

/** Bar with only its data-end (top) rounded to 4px, anchored flat to the baseline. */
const topRound = (x: number, y: number, w: number, h: number, r = 4): string => {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
};

export function Legend({ models }: { models: string[] }) {
  const color = useContext(ModelColors);
  return (
    <ul className="legend" aria-label="Models">
      {models.map((m) => (
        <li key={m}><i className="swatch" style={{ background: color(m) }} />{shortModel(m)}</li>
      ))}
    </ul>
  );
}

/* ---------- stacked daily cost ---------- */
export function DayChart({ rows }: { rows: DayModel[] }) {
  const color = useContext(ModelColors);
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<TipState | null>(null);
  const H = 240, m = { l: 52, r: 8, t: 10, b: 26 };

  const { days, byDay, models, max } = useMemo(() => {
    const byDay = new Map<string, DayModel[]>();
    for (const r of rows) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
    const keys = [...byDay.keys()].sort();
    const days: string[] = [];
    if (keys.length) {
      const d = new Date(keys[0] + 'T12:00:00');
      const end = new Date(keys[keys.length - 1] + 'T12:00:00');
      while (d <= end && days.length < 400) {
        days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        d.setDate(d.getDate() + 1);
      }
    }
    const shown = days.slice(-180);
    const models = [...new Set(rows.map((r) => r.model))].sort();
    const max = niceMax(Math.max(0, ...shown.map((d) => (byDay.get(d) ?? []).reduce((s, r) => s + r.costUsd, 0))));
    return { days: shown, byDay, models, max };
  }, [rows]);

  if (!days.length) return <div className="empty">No usage in this range.</div>;
  const pw = width - m.l - m.r, ph = H - m.t - m.b;
  const step = pw / days.length;
  const bw = Math.max(2, Math.min(28, step - 4));
  const y = (v: number) => m.t + ph - (v / max) * ph;
  const labelEvery = Math.ceil(days.length / Math.max(2, Math.floor(pw / 64)));

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={width} height={H} role="img" aria-label={`Daily cost stacked by model, ${days[0]} to ${days[days.length - 1]}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line className="grid" x1={m.l} x2={width - m.r} y1={y(max * f)} y2={y(max * f)} />
            <text className="axis" x={m.l - 8} y={y(max * f) + 4} textAnchor="end">{usdAxis(max * f)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = m.l + i * step + (step - bw) / 2;
          const stack = [...(byDay.get(d) ?? [])].sort((a, b) => models.indexOf(a.model) - models.indexOf(b.model));
          let acc = 0;
          const total = stack.reduce((s, r) => s + r.costUsd, 0);
          return (
            <g key={d}>
              {stack.filter((r) => r.costUsd > 0).map((r, k, arr) => {
                const h = (r.costUsd / max) * ph;
                const top = y(acc + r.costUsd);
                acc += r.costUsd;
                const last = k === arr.length - 1;
                return last ? (
                  <path key={r.model} d={topRound(x, top, bw, h)} fill={color(r.model)} stroke="var(--surface-1)" strokeWidth={2} paintOrder="stroke" />
                ) : (
                  <rect key={r.model} x={x} y={top} width={bw} height={h} fill={color(r.model)} stroke="var(--surface-1)" strokeWidth={2} paintOrder="stroke" />
                );
              })}
              {i % labelEvery === 0 && <text className="axis" x={x + bw / 2} y={H - 8} textAnchor="middle">{d.slice(5)}</text>}
              <rect
                className="hit" x={m.l + i * step} y={m.t} width={step} height={ph} fill="transparent"
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({
                    x: e.clientX - box.left, y: e.clientY - box.top, title: `${d} · ${usd(total)}`,
                    rows: [...stack].sort((a, b) => b.costUsd - a.costUsd).map((r) => [shortModel(r.model) + (r.unpricedTokens ? ' (partly unpriced)' : ''), usd(r.costUsd), color(r.model)]),
                  });
                }}
              />
            </g>
          );
        })}
      </svg>
      <Tip tip={tip} width={width} />
    </div>
  );
}

/* ---------- per-turn cost timeline with model-switch and compaction markers ---------- */
export function Timeline({ turns, events }: { turns: Turn[]; events: EventRow[] }) {
  const color = useContext(ModelColors);
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<TipState | null>(null);
  const H = 280, m = { l: 52, r: 12, t: 38, b: 28 };
  const max = niceMax(Math.max(0, ...turns.map((t) => t.costUsd)));
  if (!turns.length) return <div className="empty">No turns recorded.</div>;
  const pw = width - m.l - m.r, ph = H - m.t - m.b;
  const step = pw / turns.length;
  const bw = Math.max(2, Math.min(24, step - 3));
  const y = (v: number) => m.t + ph - (v / max) * ph;
  const xOf = (i: number) => m.l + i * step + (step - bw) / 2;
  const idxOfTurn = (n: number | null) => Math.max(0, turns.findIndex((t) => t.turn >= (n ?? 0)));
  let cum = 0;
  const cumul = turns.map((t) => (cum += t.costUsd));
  const every = Math.ceil(turns.length / Math.max(2, Math.floor(pw / 48)));

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={width} height={H} role="img" aria-label={`Cost per turn across ${turns.length} turns with ${events.length} markers`}>
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--sub-bg)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--sub-line)" strokeWidth="2" />
          </pattern>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line className="grid" x1={m.l} x2={width - m.r} y1={y(max * f)} y2={y(max * f)} />
            <text className="axis" x={m.l - 8} y={y(max * f) + 4} textAnchor="end">{usdAxis(max * f)}</text>
          </g>
        ))}
        {turns.map((t, i) => {
          const x = xOf(i);
          const sub = Math.min(t.sidechainCostUsd, t.costUsd);
          const main = t.costUsd - sub;
          const hm = (main / max) * ph, hs = (sub / max) * ph;
          const mc = t.mainModel ? color(t.mainModel) : 'var(--sub-line)';
          return (
            <g key={t.turn}>
              {main > 0 && (hs > 0 ? <rect x={x} y={y(main)} width={bw} height={hm} fill={mc} stroke="var(--surface-1)" strokeWidth={2} paintOrder="stroke" /> : <path d={topRound(x, y(main), bw, hm)} fill={mc} />)}
              {sub > 0 && <path d={topRound(x, y(main + sub), bw, hs)} fill="url(#hatch)" stroke="var(--sub-line)" strokeWidth={1} />}
              {t.unpricedTokens > 0 && <text className="axis warn" x={x + bw / 2} y={m.t + ph - 4} textAnchor="middle">?</text>}
              {i % every === 0 && <text className="axis" x={x + bw / 2} y={H - 8} textAnchor="middle">{t.turn}</text>}
              <rect
                className="hit" x={m.l + i * step} y={m.t} width={step} height={ph} fill="transparent"
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({
                    x: e.clientX - box.left, y: e.clientY - box.top,
                    title: `Turn ${t.turn}${t.ts ? ' · ' + when(t.ts) : ''}`,
                    rows: [
                      ['Cost', usd(t.costUsd)],
                      ['of which subagents', usd(sub), 'var(--sub-line)'],
                      ['Cumulative', usd(cumul[i]!)],
                      ['Tokens', tok(t.tokens)],
                      ['API messages', String(t.messages)],
                      ['Models', t.models.map(shortModel).join(', ') || '–'],
                      ...(t.unpricedTokens ? ([['Unpriced tokens', tok(t.unpricedTokens)]] as [string, string][]) : []),
                    ],
                  });
                }}
              />
            </g>
          );
        })}
        {events.map((e, k) => {
          const i = idxOfTurn(e.turn);
          const x = m.l + i * step;
          const isSwitch = e.kind === 'model_switch';
          const label = isSwitch ? `→ ${shortModel(e.toModel ?? '')}` : 'compact';
          const row = k % 2;
          return (
            <g key={k}>
              <line x1={x} x2={x} y1={m.t - 6} y2={m.t + ph} className={isSwitch ? 'mark-switch' : 'mark-compact'} />
              {isSwitch ? <path d={`M${x - 5},${m.t - 12} h10 l-5,8 z`} fill="var(--text-primary)" /> : <path d={`M${x},${m.t - 15} l5,5 l-5,5 l-5,-5 z`} fill="var(--text-primary)" />}
              <text className="axis strong" x={Math.min(x + 9, width - 80)} y={m.t - 15 - row * 13} dominantBaseline="middle">{label}</text>
              <rect
                x={x - 8} y={m.t - 20} width={16} height={ph + 20} fill="transparent"
                onMouseMove={(ev) => {
                  const box = (ev.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({
                    x: ev.clientX - box.left, y: ev.clientY - box.top,
                    title: isSwitch ? 'Model switch' : `Compaction (${e.detail?.trigger ?? '?'})`,
                    rows: isSwitch
                      ? [['From', shortModel(e.fromModel ?? ''), color(e.fromModel ?? '')], ['To', shortModel(e.toModel ?? ''), color(e.toModel ?? '')], ['At', when(e.ts)], ['Turn', String(e.turn)]]
                      : [['Context before', e.detail?.preTokens ? tok(Number(e.detail.preTokens)) : '–'], ['After', e.detail?.postTokens ? tok(Number(e.detail.postTokens)) : '–'], ['At', when(e.ts)], ['Turn', String(e.turn)]],
                  });
                }}
              />
            </g>
          );
        })}
      </svg>
      <Tip tip={tip} width={width} />
      <ul className="legend">
        <li><i className="swatch hatch" />subagents</li>
        <li><span className="glyph">▼</span>model switch</li>
        <li><span className="glyph">◆</span>compaction</li>
        <li className="muted">bar colour = main-thread model · ? = unpriced model</li>
      </ul>
    </div>
  );
}

/* ---------- small stacked bar for a session's model mix (cost share, message share when free) ---------- */
export function MixBar({ models }: { models: { model: string; cost: number; messages: number }[] }) {
  const color = useContext(ModelColors);
  const byCost = models.reduce((s, x) => s + x.cost, 0) > 0;
  const total = models.reduce((s, x) => s + (byCost ? x.cost : x.messages), 0) || 1;
  return (
    <span className="mix" title={models.map((x) => `${shortModel(x.model)} ${usd(x.cost)}`).join(' · ')}>
      {models.map((x) => (
        <i key={x.model} style={{ width: `${Math.max(2, ((byCost ? x.cost : x.messages) / total) * 100)}%`, background: color(x.model) }} />
      ))}
    </span>
  );
}

/* ---------- horizontal bars for rollups ---------- */
export function HBars({ rows, colorOf, format }: { rows: { label: string; value: number; note?: string }[]; colorOf?: (label: string) => string; format: (n: number) => string }) {
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <div className="hbars" role="img" aria-label="Bar chart of cost">
      {rows.map((r) => (
        <div className="hbar" key={r.label}>
          <span className="hl" title={r.label}>{r.label}</span>
          <span className="ht"><i style={{ width: `${Math.max(0.5, (r.value / max) * 100)}%`, background: colorOf ? colorOf(r.label) : 'var(--series-1)' }} /></span>
          <span className="hv">{format(r.value)}{r.note ? <em>{r.note}</em> : null}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartCard({ title, subtitle, table, children }: { title: string; subtitle?: string; table?: ReactNode; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="card">
      <header className="card-h">
        <div><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>
        {table && <button className="btn small" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>{asTable ? 'Show chart' : 'Show as table'}</button>}
      </header>
      {asTable && table ? table : children}
    </section>
  );
}
