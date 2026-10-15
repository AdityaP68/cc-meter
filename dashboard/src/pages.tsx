import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { get, post, qs, type Check, type DayModel, type Facets, type Filters, type HiddenCalls, type Overview, type PricingRow, type Rollup, type Session, type SessionDetail } from './api';
import { ChartCard, DayChart, HBars, Legend, MixBar, ModelColors, Timeline } from './charts';
import { Chip } from './chip';
import { approxUsd, dur, shortModel, tok, usd, when } from './format';

/* ---------- plumbing ---------- */
export function useApi<T>(path: string | null, deps: unknown[] = []): { data: T | null; error: string | null; loading: boolean } {
  const [state, set] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  useEffect(() => {
    if (!path) return;
    let live = true;
    set((s) => ({ ...s, loading: true }));
    get<T>(path).then(
      (d) => live && set({ data: d, error: null, loading: false }),
      (e) => live && set({ data: null, error: String(e.message ?? e), loading: false }),
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  return state;
}

export const Cost = ({ usd: v, unpriced }: { usd: number; unpriced: number }) => (
  <span className="num">{usd(v)}{unpriced > 0 && <Chip tone="warn" label="+ unpriced" help={<><b>Unpriced model.</b> {unpriced > 1 ? `${tok(unpriced)} tokens belong` : 'Some tokens belong'} to a model that has no price in ccmeter's table. They are left out of this cost, never counted as $0, so the real cost is higher. Add the model to <code>~/.ccmeter/pricing.json</code>; <code>ccmeter doctor</code> suggests a price from Claude Code's own figures.</>} />}</span>
);

/** What each Flags chip in the sessions table means, and why it matters. */
const n = (k: number, one: string, many: string) => `${k.toLocaleString()} ${k === 1 ? one : many}`;
const FLAG_HELP = {
  switches: (k: number) => <><b>Model switches.</b> The main conversation changed model {n(k, 'time', 'times')} (for example with <code>/model</code>); subagents are not counted. Each model is priced at its own rate, and prompt caches are per model, so the first reply after a switch writes the context to the cache again.</>,
  compactions: (k: number) => <><b>Compactions.</b> The conversation was summarised {n(k, 'time', 'times')} to free context, automatically near the limit or with <code>/compact</code>. The summary is itself a model call, and later replies start from a much smaller context. The session page lists each one with the context size before and after.</>,
  sub: (k: number) => <><b>Subagent calls.</b> {n(k, 'API call', 'API calls')} in this session came from subagents (the Task or Agent tool). Their cost is included in the total; the session page shows it as hatched bars per turn.</>,
  partial: (k: number) => <><b>Lower bound.</b> {n(k, 'reply', 'replies')} (mostly from subagents) {k === 1 ? 'was' : 'were'} saved to the transcript mid-stream, before the final token count was written. Their output tokens, and so the cost, are slightly understated; ccmeter never fills the gap with a guess.</>,
  hidden: (h: HiddenCalls, own: number) => <><b>Estimate: calls not in the transcript.</b> Claude Code's own total for this session is {usd(h.claudeCodeUsd)}, ccmeter's is {usd(own)}. Claude Code counted at least as many tokens as the transcript for every model, so its record covers the whole session, and the difference, {approxUsd(h.usd)}, is most likely calls it billed but never wrote to the transcript (server-side classifier calls are the leading explanation, not proven). It is derived from Claude Code's figures and not added to ccmeter's cost.{h.outputTokensExcluded > 0 && ` ${tok(h.outputTokensExcluded)} output tokens of the difference are left out: they belong to replies saved mid-stream.`}</>,
  cc: (cc: number, own: number) => <><b>Claude Code's own total</b> for this session is {usd(cc)}, ccmeter's is {usd(own)}: they differ by more than 5%. {cc > own ? 'Most likely Claude Code billed calls that it never writes to the transcript, which ccmeter cannot see.' : "Claude Code's record usually covers only the last run of a session that was resumed, so it is the smaller one."} The session page compares them per model.</>,
};

const Stat = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="stat"><div className="stat-l">{label}</div><div className="stat-v">{value}</div>{sub && <div className="stat-s">{sub}</div>}</div>
);

const ICON = { ok: '✔', info: 'ℹ', warn: '⚠', error: '✘' } as const;
const LEVEL_LABEL = { ok: 'OK', info: 'Info', warn: 'Warning', error: 'Error' } as const;

/* ---------- filter bar ---------- */
export function FilterBar({ f, set, facets }: { f: Filters; set: (f: Filters) => void; facets: Facets | null }) {
  const opt = (v: string[]) => v.map((x) => <option key={x} value={x}>{x.startsWith('claude-') ? shortModel(x) : x}</option>);
  return (
    <div className="filters" role="group" aria-label="Filters">
      <label>Range
        <select value={f.range} onChange={(e) => set({ ...f, range: e.target.value })}>
          <option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="all">All time</option>
        </select>
      </label>
      <label>Project
        <select value={f.project} onChange={(e) => set({ ...f, project: e.target.value })}><option value="">All</option>{opt(facets?.projects ?? [])}</select>
      </label>
      <label>Model
        <select value={f.model} onChange={(e) => set({ ...f, model: e.target.value })}><option value="">All</option>{opt(facets?.models ?? [])}</select>
      </label>
      <label>Source
        <select value={f.source} onChange={(e) => set({ ...f, source: e.target.value })}><option value="">All</option>{opt(facets?.sources ?? [])}</select>
      </label>
    </div>
  );
}

/* ---------- sessions (home) ---------- */
export function SessionsPage({ f, reload }: { f: Filters; reload: number }) {
  const [sort, setSort] = useState<'recent' | 'cost' | 'tokens'>('recent');
  const [limit, setLimit] = useState(50);
  useEffect(() => { setLimit(50); }, [f, sort]);
  const ov = useApi<Overview>(`/api/overview${qs(f)}`, [reload]);
  const days = useApi<DayModel[]>(`/api/rollups${qs({ ...f, by: 'daymodel' })}`, [reload]);
  const list = useApi<{ total: number; rows: Session[] }>(`/api/sessions${qs({ ...f, sort, limit })}`, [reload]);
  const color = useContext(ModelColors);
  const models = useMemo(() => [...new Set((days.data ?? []).map((d) => d.model))].sort(), [days.data]);
  const o = ov.data;

  return (
    <>
      <div className="stats">
        <Stat label="Estimated cost" value={o ? <Cost usd={o.costUsd} unpriced={o.unpricedTokens} /> : '…'} sub="list price, from transcripts" />
        <Stat label="Tokens" value={o ? tok(o.totalTokens) : '…'} sub="in + out + cache" />
        <Stat label="Sessions" value={o ? o.sessions.toLocaleString() : '…'} sub={o?.bySource.length ? o.bySource.map((s) => `${s.source}: ${s.sessions}`).join(' · ') : undefined} />
        <Stat label="Model switches" value={o ? o.switches : '…'} sub="main thread only" />
        <Stat label="Compactions" value={o ? o.compactions : '…'} />
      </div>

      <ChartCard
        title="Cost per day"
        subtitle="Stacked by model; days in your local time zone"
        table={<DayTable rows={days.data ?? []} />}
      >
        <Legend models={models} />
        <DayChart rows={days.data ?? []} />
      </ChartCard>

      <section className="card">
        <header className="card-h"><div><h2>Sessions</h2><p className="muted">{list.data ? `${Math.min(limit, list.data.total)} of ${list.data.total}` : ''}</p></div>
          <div className="seg" role="group" aria-label="Sort">
            {(['recent', 'cost', 'tokens'] as const).map((s) => <button key={s} className={sort === s ? 'on' : ''} onClick={() => setSort(s)} aria-pressed={sort === s}>{s === 'recent' ? 'Most recent' : s === 'cost' ? 'Highest cost' : 'Most tokens'}</button>)}
          </div>
        </header>
        <p className="flag-legend muted small"><b>Flags:</b> ⇄ model switches · ◆ compactions · sub = subagent calls · ≥ lower bound = cost slightly understated · ≈ $x not in transcript = estimated cost of calls Claude Code billed but never wrote to the transcript · CC = Claude Code's own total differs by more than 5% · + unpriced = a model with no price, left out of the cost. Hover, focus or tap a chip for details.</p>
        <div className="scroll">
          <table className="tbl">
            <caption className="sr">Recorded Claude Code sessions</caption>
            <thead><tr><th>Started</th><th>Project / title</th><th className="r">Turns</th><th className="r">Duration</th><th className="r">Tokens</th><th className="r">Cost</th><th>Models</th><th>Flags</th></tr></thead>
            <tbody>
              {(list.data?.rows ?? []).map((s) => {
                const cc = s.costState?.totalCostUSD;
                const differs = cc !== undefined && cc > 0 && Math.abs(cc - s.costUsd) / cc > 0.05;
                const h = s.hiddenCalls;
                return (
                  <tr key={s.sessionId}>
                    <td className="nowrap">{when(s.startedAt)}</td>
                    <td><a href={`#/session/${s.sessionId}`} className="title">{s.title || <span className="muted" title="Claude Code wrote no title for this session; label built from its entry point, model and turns">{s.label}</span>}</a><div className="muted small">{s.project ?? '–'}{s.source !== 'claude-code' && <span className="badge">{s.source}</span>}</div></td>
                    <td className="r num">{s.turns}</td>
                    <td className="r num">{dur(s.durationMs)}</td>
                    <td className="r num">{tok(s.totalTokens)}</td>
                    <td className="r"><Cost usd={s.costUsd} unpriced={s.unpricedTokens} /></td>
                    <td><MixBar models={s.models} /><div className="muted small">{s.models.map((m) => shortModel(m.model)).join(', ')}</div></td>
                    <td>
                      <div className="flags">
                        {!(s.switches || s.compactions || s.sidechainMessages || s.partialMessages || differs || h) && <span className="muted" title="No model switch, compaction, subagent or partial usage in this session">–</span>}
                        {s.switches > 0 && <Chip label={`⇄ ${s.switches}`} help={FLAG_HELP.switches(s.switches)} />}
                        {s.compactions > 0 && <Chip label={`◆ ${s.compactions}`} help={FLAG_HELP.compactions(s.compactions)} />}
                        {s.sidechainMessages > 0 && <Chip label={`sub ${s.sidechainMessages}`} help={FLAG_HELP.sub(s.sidechainMessages)} />}
                        {s.partialMessages > 0 && <Chip tone="info" label="≥ lower bound" help={FLAG_HELP.partial(s.partialMessages)} />}
                        {h ? <Chip tone="info" label={`${approxUsd(h.usd)} not in transcript`} help={FLAG_HELP.hidden(h, s.costUsd)} />
                          : differs && <Chip tone="info" label={`CC ${usd(cc!)}`} help={FLAG_HELP.cc(cc!, s.costUsd)} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.data && list.data.rows.length === 0 && <div className="empty">No sessions match. Run <code>ccmeter record --all</code> to backfill.</div>}
        </div>
        {list.data && list.data.total > limit && <button className="btn" onClick={() => setLimit(limit + 100)}>Show more</button>}
        {list.error && <div className="banner error">{list.error}</div>}
      </section>
    </>
  );
}

function DayTable({ rows }: { rows: DayModel[] }) {
  return (
    <div className="scroll"><table className="tbl"><caption className="sr">Cost per day and model</caption>
      <thead><tr><th>Day</th><th>Model</th><th className="r">Tokens</th><th className="r">Cost</th></tr></thead>
      <tbody>{[...rows].reverse().map((r) => <tr key={r.day + r.model}><td>{r.day}</td><td>{shortModel(r.model)}</td><td className="r num">{tok(r.totalTokens)}</td><td className="r"><Cost usd={r.costUsd} unpriced={r.unpricedTokens} /></td></tr>)}</tbody></table></div>
  );
}

/* ---------- rollups ---------- */
export function RollupsPage({ f, reload }: { f: Filters; reload: number }) {
  const [by, setBy] = useState<'day' | 'project' | 'model'>('project');
  const r = useApi<Rollup[]>(`/api/rollups${qs({ ...f, by })}`, [reload]);
  const color = useContext(ModelColors);
  const rows = r.data ?? [];
  return (
    <section className="card">
      <header className="card-h"><div><h2>Rollups</h2><p className="muted">Computed from per-message rows, so a session that spans days or models is split across them.</p></div>
        <div className="seg" role="group" aria-label="Group by">{(['day', 'project', 'model'] as const).map((k) => <button key={k} className={by === k ? 'on' : ''} onClick={() => setBy(k)} aria-pressed={by === k}>By {k}</button>)}</div>
      </header>
      <HBars
        rows={rows.slice(0, 25).map((x) => ({ label: by === 'model' ? shortModel(x.key) : x.key, value: x.costUsd, note: x.unpricedTokens ? ' + unpriced' : undefined }))}
        colorOf={by === 'model' ? (l) => color(rows.find((x) => shortModel(x.key) === l)?.key ?? l) : undefined}
        format={usd}
      />
      <div className="scroll">
        <table className="tbl"><caption className="sr">Rollup by {by}</caption>
          <thead><tr><th>{by[0]!.toUpperCase() + by.slice(1)}</th><th className="r">Sessions</th><th className="r">API messages</th><th className="r">Tokens</th><th className="r">Cost</th></tr></thead>
          <tbody>{rows.map((x) => <tr key={x.key}><td>{by === 'model' ? shortModel(x.key) : x.key}</td><td className="r num">{x.sessions}</td><td className="r num">{x.messages}</td><td className="r num">{tok(x.totalTokens)}</td><td className="r"><Cost usd={x.costUsd} unpriced={x.unpricedTokens} /></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- session detail ---------- */
export function SessionPage({ id, reload }: { id: string; reload: number }) {
  const { data, error } = useApi<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`, [reload]);
  const color = useContext(ModelColors);
  if (error) return <div className="banner error">Could not load this session: {error}. <a href="#/">Back</a></div>;
  if (!data) return <div className="empty">Loading…</div>;
  const { session: s, turns, events, reconciliation } = data;
  const cc = s.costState?.totalCostUSD;
  return (
    <>
      <p><a href="#/">← All sessions</a></p>
      <section className="card">
        <h1>{s.title || <span className="muted">{s.label}</span>}</h1>
        <p className="muted">{s.cwd ?? s.project ?? '–'} · {when(s.startedAt)} → {when(s.endedAt)} ({dur(s.durationMs)}) · Claude Code {s.ccVersions.join(', ') || '–'} · parser <span className={`badge ${s.parserStatus === 'verified' ? '' : 'warn'}`}>{s.parserStatus}</span> · <span className="badge">{s.source}</span></p>
        <p className="mono small muted">{s.sessionId}</p>
        <div className="stats">
          <Stat label="Estimated cost" value={<Cost usd={s.costUsd} unpriced={s.unpricedTokens} />} sub={cc !== undefined ? `Claude Code reports ${usd(cc)}` : 'no Claude Code cost entry'} />
          <Stat label="Tokens" value={tok(s.totalTokens)} sub={`in ${tok(s.inputTokens)} · out ${tok(s.outputTokens)}`} />
          <Stat label="Cache" value={tok(s.cacheReadTokens)} sub={`read · ${tok(s.cacheWriteTokens)} written`} />
          <Stat label="Turns" value={s.turns} sub={`${s.messages} API messages${s.sidechainMessages ? `, ${s.sidechainMessages} from subagents` : ''}`} />
          <Stat label="Switches / compactions" value={`${s.switches} / ${s.compactions}`} />
        </div>
        {s.unpricedModels.length > 0 && <div className="banner warn"><b>⚠ Unpriced:</b> {s.unpricedModels.join(', ')}: the cost above excludes {tok(s.unpricedTokens)} tokens from {s.unpricedModels.length === 1 ? 'this model' : 'these models'}. Add a price in <code>~/.ccmeter/pricing.json</code>.{s.unpricedModels.map((m) => {
          const u = s.costState?.modelUsage[m];
          return <div key={m} className="small">Claude Code's figure for {shortModel(m)} in this session: {u ? <b>{usd(u.costUSD)}</b> : 'none recorded'} (Claude Code's own estimate; not included in the cost above).</div>;
        })}</div>}
        {s.hiddenCalls && <div className="banner info"><b>ℹ Calls not in the transcript {approxUsd(s.hiddenCalls.usd)}</b> (estimate): Claude Code's own total is {usd(s.hiddenCalls.claudeCodeUsd)} and it counted at least as many tokens as the transcript for every model, so the difference is most likely calls it billed but never wrote there. Not added to the cost above; the table at the bottom compares per model.{s.hiddenCalls.outputTokensExcluded > 0 && ` ${tok(s.hiddenCalls.outputTokensExcluded)} output tokens of the difference are left out, as they belong to replies saved mid-stream.`}</div>}
        {s.partialMessages > 0 && <div className="banner info"><b>ℹ Lower bound:</b> {s.partialMessages} messages (mostly subagents) were saved mid-stream, so their output tokens, and the cost, are slightly understated. Claude Code's own total is shown above where it recorded one.</div>}
      </section>

      <ChartCard title="Cost per turn" subtitle="Each bar is one user turn. Hatched = subagent cost." table={<TurnTable turns={turns} />}>
        <Legend models={s.models.map((m) => m.model)} />
        <Timeline turns={turns} events={events} />
      </ChartCard>

      <section className="card">
        <h2>Models</h2>
        <div className="scroll"><table className="tbl"><caption className="sr">Per-model totals</caption>
          <thead><tr><th>Model</th><th className="r">Messages</th><th className="r">Input</th><th className="r">Output</th><th className="r">Cache write</th><th className="r">Cache read</th><th className="r">Cost</th></tr></thead>
          <tbody>{s.models.map((m) => <tr key={m.model}><td><i className="swatch" style={{ background: color(m.model) }} />{shortModel(m.model)}</td><td className="r num">{m.messages}</td><td className="r num">{tok(m.input)}</td><td className="r num">{tok(m.output)}</td><td className="r num">{tok(m.cacheWrite)}</td><td className="r num">{tok(m.cacheRead)}</td><td className="r"><Cost usd={m.cost} unpriced={m.unpriced ? 1 : 0} /></td></tr>)}</tbody></table></div>
      </section>

      {events.length > 0 && (
        <section className="card"><h2>Events</h2>
          <ul className="events">{events.map((e, i) => <li key={i}><span className="muted">{when(e.ts)} · turn {e.turn}</span> {e.kind === 'model_switch' ? <>⇄ switched <b>{shortModel(e.fromModel ?? '')}</b> → <b>{shortModel(e.toModel ?? '')}</b></> : <>◆ compaction ({String(e.detail?.trigger ?? '?')}): context {e.detail?.preTokens ? tok(Number(e.detail.preTokens)) : '?'} → {e.detail?.postTokens ? tok(Number(e.detail.postTokens)) : '?'}</>}</li>)}</ul>
        </section>
      )}

      <section className="card"><h2>Check against Claude Code's own accounting</h2>
        <p className="muted">Claude Code writes a <code>cost-state</code> entry into the transcript. Equal token counts mean ccmeter read the transcript correctly. A difference means one side sees calls the other does not: Claude Code can bill calls that are never written as transcript messages, and its entry can cover less than the transcript in sessions resumed across several processes. Neither number is silently preferred (see docs/FORMATS.md).</p>
        <div className="scroll"><table className="tbl"><caption className="sr">ccmeter versus Claude Code</caption>
          <thead><tr><th>Model</th><th>Source</th><th className="r">Input</th><th className="r">Output</th><th className="r">Cache write</th><th className="r">Cache read</th><th className="r">Cost</th></tr></thead>
          <tbody>{reconciliation.flatMap((r) => [
            <tr key={r.model + 'a'}><td rowSpan={r.claudeCode ? 3 : 1}>{shortModel(r.model)}</td><td>ccmeter</td><td className="r num">{r.ccmeter.input.toLocaleString()}</td><td className="r num">{r.ccmeter.output.toLocaleString()}</td><td className="r num">{r.ccmeter.cacheWrite.toLocaleString()}</td><td className="r num">{r.ccmeter.cacheRead.toLocaleString()}</td><td className="r num">{r.ccmeter.cost === null ? <span className="badge warn">unpriced</span> : usd(r.ccmeter.cost)}</td></tr>,
            ...(r.claudeCode ? [
              <tr key={r.model + 'b'}><td>Claude Code</td><td className="r num">{r.claudeCode.input.toLocaleString()}</td><td className="r num">{r.claudeCode.output.toLocaleString()}</td><td className="r num">{r.claudeCode.cacheWrite.toLocaleString()}</td><td className="r num">{r.claudeCode.cacheRead.toLocaleString()}</td><td className="r num">{usd(r.claudeCode.cost)}</td></tr>,
              <tr key={r.model + 'c'}><td>{r.tokensMatch ? <span className="badge ok">✔ match</span> : <span className="badge info">ℹ difference</span>}</td>{r.delta ? [r.delta.input, r.delta.output, r.delta.cacheWrite, r.delta.cacheRead].map((d, i) => <td key={i} className="r num muted">{d === 0 ? '0' : (d > 0 ? '+' : '') + d.toLocaleString()}</td>) : <td colSpan={4} />}<td /></tr>,
            ] : []),
          ])}</tbody></table></div>
      </section>
    </>
  );
}

function TurnTable({ turns }: { turns: SessionDetail['turns'] }) {
  return (
    <div className="scroll"><table className="tbl"><caption className="sr">Cost per turn</caption>
      <thead><tr><th className="r">Turn</th><th>Time</th><th className="r">Messages</th><th className="r">Tokens</th><th className="r">Subagent cost</th><th className="r">Cost</th><th>Models</th></tr></thead>
      <tbody>{turns.map((t) => <tr key={t.turn}><td className="r num">{t.turn}</td><td className="nowrap">{when(t.ts)}</td><td className="r num">{t.messages}</td><td className="r num">{tok(t.tokens)}</td><td className="r num">{usd(t.sidechainCostUsd)}</td><td className="r"><Cost usd={t.costUsd} unpriced={t.unpricedTokens} /></td><td>{t.models.map(shortModel).join(', ')}</td></tr>)}</tbody></table></div>
  );
}

/* ---------- health ---------- */
export function HealthPage({ reload }: { reload: number }) {
  const { data, error } = useApi<{ checks: Check[]; pricing: PricingRow[] }>('/api/doctor', [reload]);
  if (error) return <div className="banner error">{error}</div>;
  if (!data) return <div className="empty">Running checks…</div>;
  return (
    <>
      <section className="card"><h2>Health checks</h2>
        <p className="muted">Same checks as <code>ccmeter doctor</code>.</p>
        <ul className="checks">{data.checks.map((c) => (
          <li key={c.id} className={`check ${c.level}`}><span className="ico" aria-hidden>{ICON[c.level]}</span><div><b className="sr">{LEVEL_LABEL[c.level]}: </b>{c.title}{c.detail && <div className="muted small">{c.detail}</div>}</div></li>
        ))}</ul>
      </section>
      <section className="card"><h2>Price table versus Claude Code's own costs</h2>
        <p className="muted">For each model you used: Claude Code's own token counts, priced with <code>pricing.json</code>, should land on the cost Claude Code itself recorded. <b>Basis</b> is the label in <code>pricing.json</code> (<i>verified</i> = checked when the table was written, <i>list</i> = published price, <i>derived</i> = fitted from Claude Code's own figures by <code>ccmeter doctor</code>); <b>Matches</b> is the evidence from your sessions. Only sessions where Claude Code wrote a cost entry can be compared.</p>
        {data.pricing.length === 0 ? <div className="empty">No priced model recorded yet.</div> : (
          <div className="scroll"><table className="tbl"><caption className="sr">Price verification</caption>
            <thead><tr><th>Model</th><th>Basis</th><th className="r" title="Sessions where Claude Code's cost lies in the range the table predicts from Claude Code's tokens">Matches</th><th className="r">Largest miss</th><th className="r" title="Sessions whose token counts equal ccmeter's exactly">Exact-token sessions</th><th className="r">Max error (exact)</th></tr></thead>
            <tbody>{data.pricing.map((p) => (
              <tr key={p.model}><td>{shortModel(p.model)}</td><td><span className={`badge ${p.basis === 'verified' ? 'ok' : p.basis === 'derived' ? 'warn' : 'info'}`}>{p.basis}</span></td>
                {p.pairs === 0 ? <td colSpan={4} className="muted">no Claude Code cost recorded to compare</td> : (
                  <><td className="r num">{p.consistent} of {p.pairs}</td><td className="r num">${p.maxOutsideUsd.toFixed(4)}</td><td className="r num">{p.exactTokenPairs}</td><td className="r num">{p.exactTokenPairs ? `$${p.exactMaxAbsErrUsd.toFixed(5)}` : '–'}</td></>
                )}
              </tr>
            ))}</tbody></table></div>
        )}
      </section>
    </>
  );
}

export { post };
