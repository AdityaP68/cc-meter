import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ccmeterHome, packageRoot } from './paths.js';

export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  fastMultiplier?: number;
  /** Rates that apply when a single request's prompt exceeds aboveTokens. */
  longContext?: { aboveTokens: number; input: number; output: number };
  /** verified: reproduces Claude Code's costUSD; list: published price; derived: fitted from cost-state (ADR 0008). */
  basis?: 'verified' | 'list' | 'derived';
}

export interface PriceTable {
  version: string;
  webSearchPerRequest: number;
  models: Record<string, ModelPrice>;
  /** Stable hash of the effective table; stored with each session so a price change triggers a re-cost. */
  hash: string;
  /** Files that contributed (package table first, then user override). */
  sources: string[];
  /** Override entries that were ignored because they are not valid prices (surfaced by `doctor`). */
  rejected: string[];
}

export interface Priceable {
  model: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheWrite1h: number;
  cacheRead: number;
  webSearch: number;
  speed: string | null;
}

interface RawTable {
  version?: string;
  webSearchPerRequest?: number;
  models?: Record<string, ModelPrice>;
}

function readTable(file: string): RawTable | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as RawTable;
  } catch {
    return null;
  }
}

const rate = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** A price entry is usable only if every rate is a finite, non-negative number. */
function validPrice(p: unknown): p is ModelPrice {
  if (typeof p !== 'object' || p === null) return false;
  const m = p as Record<string, unknown>;
  if (!rate(m.input) || !rate(m.output) || !rate(m.cacheRead) || !rate(m.cacheWrite5m) || !rate(m.cacheWrite1h)) return false;
  if (m.fastMultiplier !== undefined && !(rate(m.fastMultiplier) && m.fastMultiplier > 0)) return false;
  if (m.basis !== undefined && m.basis !== 'verified' && m.basis !== 'list' && m.basis !== 'derived') return false;
  if (m.longContext !== undefined) {
    const l = m.longContext as Record<string, unknown> | null;
    if (typeof l !== 'object' || l === null || !rate(l.aboveTokens) || !rate(l.input) || !rate(l.output)) return false;
    if (!(m.input as number > 0)) return false; // messageCost scales the other rates by longContext.input / input
  }
  return true;
}

export function loadPricing(opts: { overridePath?: string | null } = {}): PriceTable {
  const base = path.join(packageRoot(), 'pricing.json');
  const sources = [base];
  const t = readTable(base);
  if (!t?.models) throw new Error(`pricing table unreadable: ${base}`);
  const models: Record<string, ModelPrice> = { ...t.models };
  const overridePath = opts.overridePath === undefined ? path.join(ccmeterHome(), 'pricing.json') : opts.overridePath;
  let webSearchPerRequest = t.webSearchPerRequest ?? 0.01;
  const rejected: string[] = [];
  if (overridePath && fs.existsSync(overridePath)) {
    const o = readTable(overridePath);
    if (!o || typeof o !== 'object') rejected.push('pricing.json is not valid JSON');
    else {
      const entries = o.models && typeof o.models === 'object' ? Object.entries(o.models) : [];
      for (const [id, price] of entries) {
        if (id === '__proto__' || !validPrice(price)) rejected.push(id);
        else models[id] = price;
      }
      if (entries.length) sources.push(overridePath);
      if (rate(o.webSearchPerRequest)) webSearchPerRequest = o.webSearchPerRequest;
      else if (o.webSearchPerRequest !== undefined) rejected.push('webSearchPerRequest');
    }
  }
  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify({ models, webSearchPerRequest }))
    .digest('hex')
    .slice(0, 12);
  return { version: t.version ?? 'unknown', webSearchPerRequest, models, hash, sources, rejected };
}

/** Resolve a transcript model id to a price: exact id, then without a trailing -YYYYMMDD date. */
export function lookupPrice(table: PriceTable, model: string): { id: string; price: ModelPrice } | null {
  if (Object.hasOwn(table.models, model)) return { id: model, price: table.models[model]! };
  const undated = model.replace(/-\d{8}$/, '');
  if (Object.hasOwn(table.models, undated)) return { id: undated, price: table.models[undated]! };
  return null;
}

/** Cost in USD for one message, or null when the model is not in the table (unpriced — never zero). */
export function messageCost(table: PriceTable, m: Priceable): number | null {
  const found = lookupPrice(table, m.model);
  if (!found) return null;
  const p = found.price;
  let inRate = p.input;
  let outRate = p.output;
  let readRate = p.cacheRead;
  let w5 = p.cacheWrite5m;
  let w1 = p.cacheWrite1h;
  if (p.longContext && m.input + m.cacheRead + m.cacheWrite > p.longContext.aboveTokens) {
    const k = p.longContext.input / p.input;
    inRate = p.longContext.input;
    outRate = p.longContext.output;
    readRate *= k;
    w5 *= k;
    w1 *= k;
  }
  const write5m = Math.max(0, m.cacheWrite - m.cacheWrite1h);
  let usd =
    (m.input * inRate + m.output * outRate + m.cacheRead * readRate + write5m * w5 + m.cacheWrite1h * w1) / 1e6;
  if (m.speed === 'fast' && p.fastMultiplier) usd *= p.fastMultiplier;
  usd += m.webSearch * table.webSearchPerRequest;
  return Number.isFinite(usd) ? usd : null;
}
