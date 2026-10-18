import { Fragment, useEffect, useState, type ReactNode } from 'react';

/*
 * A small markdown renderer for the docs pages (docs/guide/*.md), written for exactly the subset those pages use:
 * ## / ### headings, paragraphs, - bullets, 1. lists, pipe tables, fenced code, `code`, **bold**, *italic*, > quotes, links.
 * It builds React elements only (never dangerouslySetInnerHTML, so nothing in a page can inject markup), it never
 * throws (anything unsupported degrades to a paragraph of plain text), and it has no dependencies.
 */

export interface OutlineItem { id: string; anchor: string; text: string }
export interface Rendered { nodes: ReactNode[]; outline: OutlineItem[] }
export interface RenderOptions {
  /** Slugs of the known guide pages: a link to an unknown one is shown as plain text. Without it every `x.md` link is kept. */
  knownSlugs?: ReadonlySet<string>;
  /** Drop a leading `# Title` (the page renders its own h1). Default true. */
  skipTitle?: boolean;
}

type Align = 'left' | 'right' | 'center' | undefined;
export type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'list'; ordered: boolean; start: number; items: string[] }
  | { t: 'code'; lang: string; text: string }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'table'; head: string[]; align: Align[]; rows: string[][] }
  | { t: 'hr' };

/* ---------- block parser ---------- */
const FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const CELL = /^:?-+:?$/;

/** Split a table row on unescaped pipes; `\|` becomes a literal pipe. */
function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '\\' && line[i + 1] === '|') { cur += '|'; i++; } else if (c === '|') { cells.push(cur); cur = ''; } else cur += c;
  }
  cells.push(cur);
  const t = line.trim();
  if (t.startsWith('|')) cells.shift();
  if (t.endsWith('|') && !t.endsWith('\\|')) cells.pop();
  return cells.map((c) => c.trim());
}

function isTableStart(lines: string[], i: number): boolean {
  const head = lines[i];
  const sep = lines[i + 1];
  if (head === undefined || sep === undefined || !head.includes('|') || !sep.includes('-')) return false;
  const h = splitRow(head);
  const s = splitRow(sep);
  return h.length === s.length && s.length > 0 && s.every((c) => CELL.test(c));
}

const itemOrdered = (m: RegExpExecArray) => /\d/.test(m[2]![0]!);

/** Does this line begin a block that ends a running paragraph? */
function interrupts(lines: string[], i: number): boolean {
  const l = lines[i]!;
  if (FENCE.test(l) || HEADING.test(l) || HR.test(l) || QUOTE.test(l) || isTableStart(lines, i)) return true;
  const m = ITEM.exec(l);
  return !!m && (!itemOrdered(m) || parseInt(m[2]!, 10) === 1);
}

export function parseBlocks(lines: string[], depth = 0): Block[] {
  const out: Block[] = [];
  const n = lines.length;
  let i = 0;
  while (i < n) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }
    let m: RegExpExecArray | null;

    if ((m = FENCE.exec(line))) {
      const indent = m[1]!.length;
      const ch = m[2]![0]!;
      const len = m[2]!.length;
      const body: string[] = [];
      i++;
      while (i < n) {
        const l = lines[i]!;
        const t = l.trim();
        if (t.length >= len && t === ch.repeat(t.length)) { i++; break; }
        body.push(l.replace(new RegExp(`^ {0,${indent}}`), ''));
        i++;
      }
      out.push({ t: 'code', lang: m[3]!.toLowerCase(), text: body.join('\n') });
      continue;
    }
    if ((m = HEADING.exec(line))) { out.push({ t: 'h', level: m[1]!.length, text: m[2]! }); i++; continue; }
    if (HR.test(line)) { out.push({ t: 'hr' }); i++; continue; }
    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < n && (m = QUOTE.exec(lines[i]!))) { inner.push(m[1]!); i++; }
      out.push({ t: 'quote', blocks: depth < 2 ? parseBlocks(inner, depth + 1) : [{ t: 'p', text: inner.join(' ').trim() }] });
      continue;
    }
    if (isTableStart(lines, i)) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]!).map((c): Align => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : undefined));
      const rows: string[][] = [];
      i += 2;
      while (i < n && lines[i]!.trim() && lines[i]!.includes('|') && !FENCE.test(lines[i]!)) {
        const cells = splitRow(lines[i]!);
        rows.push(head.map((_, k) => cells[k] ?? ''));
        i++;
      }
      out.push({ t: 'table', head, align, rows });
      continue;
    }
    if ((m = ITEM.exec(line))) {
      const ordered = itemOrdered(m);
      const start = ordered ? parseInt(m[2]!, 10) : 1;
      const items: string[] = [];
      while (i < n) {
        const l = lines[i]!;
        if (!l.trim()) {
          // A blank line continues the list when the next line is another item of the same kind or an indented continuation.
          let j = i;
          while (j < n && !lines[j]!.trim()) j++;
          if (j >= n) break;
          const nx = lines[j]!;
          const nm = ITEM.exec(nx);
          if (nm && !HR.test(nx)) {
            if (itemOrdered(nm) !== ordered) break;
            i = j;
            continue;
          }
          if (/^\s{2,}\S/.test(nx) && !FENCE.test(nx) && !QUOTE.test(nx)) { items[items.length - 1] += ` ${nx.trim()}`; i = j + 1; continue; }
          break;
        }
        if (HR.test(l) || FENCE.test(l) || HEADING.test(l) || QUOTE.test(l)) break;
        const nm = ITEM.exec(l);
        if (nm) {
          if (itemOrdered(nm) !== ordered) break;
          items.push(nm[3]!.trim());
          i++;
          continue;
        }
        if (isTableStart(lines, i)) break;
        items[items.length - 1] += ` ${l.trim()}`; // a continuation line (nested lists are flattened)
        i++;
      }
      out.push({ t: 'list', ordered, start, items });
      continue;
    }

    const para = [line.trim()];
    i++;
    while (i < n && lines[i]!.trim() && !interrupts(lines, i)) { para.push(lines[i]!.trim()); i++; }
    out.push({ t: 'p', text: para.join(' ') });
  }
  return out;
}

/* ---------- inline renderer ---------- */

/** Where a link may go: another guide page (`name.md`, optionally `#section`) or a dashboard route (`#/...`). Anything else: null. */
export function resolveHref(href: string, known?: ReadonlySet<string>): string | null {
  const h = href.trim();
  if (/^#\/[A-Za-z0-9._~\-/]*$/.test(h)) return h;
  const m = /^(?:\.\/)?([a-z0-9][a-z0-9-]*)\.md(?:#([A-Za-z0-9_-]+))?$/i.exec(h);
  if (!m) return null;
  const slug = m[1]!.toLowerCase();
  if (known && !known.has(slug)) return null;
  return `#/docs/${slug}${m[2] ? `/${m[2].toLowerCase()}` : ''}`;
}

/** The text of a piece of inline markdown without its markup (heading ids, aria labels). */
const plain = (s: string) => s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\\(.)/g, '$1').replace(/[`*]/g, '').trim();

/** Index of the bracket that closes the one at `from`, honouring nesting and backslash escapes; -1 if none. */
function closer(s: string, from: number, open: string, close: string): number {
  let depth = 0;
  for (let k = from; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return k;
  }
  return -1;
}

interface Ctx { known?: ReadonlySet<string> }

/** Longest run of inline markdown that is parsed. The scanners below are quadratic in the worst case (an unmatched `*` or `[` rescans
 *  the rest of the run), so anything longer, which only hostile input produces, is shown as plain text. */
const MAX_INLINE = 5000;

function inline(s: string, ctx: Ctx, key: string, depth = 0): ReactNode[] {
  if (s.length > MAX_INLINE) return [s];
  const nodes: ReactNode[] = [];
  let buf = '';
  let seq = 0;
  const flush = () => { if (buf) { nodes.push(buf); buf = ''; } };
  const add = (el: ReactNode) => { flush(); nodes.push(el); };
  const k = () => `${key}.${seq++}`;
  const nested = depth < 4;
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === '\\' && i + 1 < s.length && /[\\`*_{}[\]()#+\-.!|>~<]/.test(s[i + 1]!)) { buf += s[i + 1]; i += 2; continue; }
    if (c === '`') {
      let run = 1;
      while (s[i + run] === '`') run++;
      const fence = '`'.repeat(run);
      const j = s.indexOf(fence, i + run);
      if (j > i + run) {
        let code = s.slice(i + run, j);
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ')) code = code.slice(1, -1);
        add(<code key={k()}>{code}</code>);
        i = j + run;
      } else { buf += fence; i += run; }
      continue;
    }
    if (nested && c === '*' && s[i + 1] === '*') {
      const j = s.indexOf('**', i + 2);
      if (j > i + 2 && s.slice(i + 2, j).trim()) { add(<strong key={k()}>{inline(s.slice(i + 2, j), ctx, k(), depth + 1)}</strong>); i = j + 2; continue; }
    } else if (nested && c === '*' && s[i + 1] !== undefined && !/[\s*]/.test(s[i + 1]!)) {
      let j = s.indexOf('*', i + 1);
      while (j !== -1 && (/\s/.test(s[j - 1]!) || s[j + 1] === '*' || s[j - 1] === '*')) j = s.indexOf('*', j + 1);
      if (j > i + 1) { add(<em key={k()}>{inline(s.slice(i + 1, j), ctx, k(), depth + 1)}</em>); i = j + 1; continue; }
    }
    if (nested && (c === '[' || (c === '!' && s[i + 1] === '['))) {
      const isImage = c === '!';
      const o = isImage ? i + 1 : i;
      const close = closer(s, o, '[', ']');
      if (close !== -1 && s[close + 1] === '(') {
        const end = closer(s, close + 1, '(', ')');
        if (end !== -1) {
          const label = s.slice(o + 1, close);
          const target = isImage ? null : resolveHref(s.slice(close + 2, end).trim().split(/\s+/)[0] ?? '', ctx.known);
          const body = inline(label, ctx, k(), depth + 1);
          add(target ? <a key={k()} href={target}>{body}</a> : <Fragment key={k()}>{body}</Fragment>); // not a page or route: plain text
          i = end + 1;
          continue;
        }
      }
    }
    buf += c;
    i++;
  }
  flush();
  return nodes;
}

/* ---------- block renderer ---------- */
const COPY_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console']);

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const t = window.setTimeout(() => setState('idle'), 1800);
    return () => window.clearTimeout(t);
  }, [state]);
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  };
  return (
    <>
      <button type="button" className="btn small md-copy" aria-label={`Copy ${label} code`} onClick={() => { void copy(); }}>{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}</button>
      <span className="sr" role="status">{state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Could not copy; select the text instead' : ''}</span>
    </>
  );
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const copyable = COPY_LANGS.has(lang);
  return (
    <div className="md-code">
      {(lang || copyable) && (
        <div className="md-code-h"><span className="small muted">{lang}</span>{copyable && <CopyButton text={text} label={lang} />}</div>
      )}
      <pre tabIndex={0}><code>{text}</code></pre>
    </div>
  );
}

const CALLOUT = /^\*\*(unverified|note|limit):?\*\*/i;

const slugify = (s: string) => s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
/** The DOM id of a heading anchor (prefixed so it cannot collide with the app's own ids). */
export const headingDomId = (anchor: string) => `d-${anchor}`;

interface State { ctx: Ctx; used: Map<string, number>; outline: OutlineItem[] }

function renderBlocks(blocks: Block[], st: State, key: string): ReactNode[] {
  return blocks.map((b, bi): ReactNode => {
    const kb = `${key}${bi}`;
    switch (b.t) {
      case 'h': {
        const lvl = b.level <= 2 ? 2 : b.level === 3 ? 3 : 4; // the page title is the only h1
        const text = plain(b.text);
        const base = slugify(text);
        const seen = st.used.get(base) ?? 0;
        st.used.set(base, seen + 1);
        const anchor = seen ? `${base}-${seen + 1}` : base;
        if (b.level === 2) st.outline.push({ id: headingDomId(anchor), anchor, text });
        const Tag = `h${lvl}` as 'h2' | 'h3' | 'h4';
        return <Tag key={kb} id={headingDomId(anchor)}>{inline(b.text, st.ctx, kb)}</Tag>;
      }
      case 'p':
        return <p key={kb}>{inline(b.text, st.ctx, kb)}</p>;
      case 'list': {
        const items = b.items.map((it, ii) => <li key={`${kb}.${ii}`}>{inline(it, st.ctx, `${kb}.${ii}`)}</li>);
        return b.ordered ? <ol key={kb} start={b.start}>{items}</ol> : <ul key={kb}>{items}</ul>;
      }
      case 'code':
        return <CodeBlock key={kb} lang={b.lang} text={b.text} />;
      case 'quote': {
        const first = b.blocks[0];
        const kind = first?.t === 'p' ? CALLOUT.exec(first.text)?.[1]?.toLowerCase() : undefined;
        return <blockquote key={kb} className={kind ? `md-callout ${kind}` : 'md-callout'}>{renderBlocks(b.blocks, st, `${kb}q`)}</blockquote>;
      }
      case 'table': {
        const label = `Table: ${b.head.map(plain).filter(Boolean).slice(0, 4).join(', ') || 'data'}`;
        return (
          <div key={kb} className="md-table" role="region" tabIndex={0} aria-label={label}>
            <table>
              <thead><tr>{b.head.map((h, ci) => <th key={ci} scope="col" style={{ textAlign: b.align[ci] }}>{inline(h, st.ctx, `${kb}h${ci}`)}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} style={{ textAlign: b.align[ci] }}>{inline(c, st.ctx, `${kb}r${ri}c${ci}`)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      }
      case 'hr':
        return <hr key={kb} />;
    }
  });
}

/** Render markdown source to React nodes plus the list of its `##` headings. Never throws. */
export function renderMarkdown(source: string, opts: RenderOptions = {}): Rendered {
  try {
    let blocks = parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'));
    if ((opts.skipTitle ?? true) && blocks[0]?.t === 'h' && blocks[0].level === 1) blocks = blocks.slice(1);
    const st: State = { ctx: { known: opts.knownSlugs }, used: new Map(), outline: [] };
    const nodes = renderBlocks(blocks, st, 'b');
    return { nodes, outline: st.outline };
  } catch {
    return { nodes: [<p key="raw">{source}</p>], outline: [] };
  }
}
