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
  basis?: 'verified' | 'list';
}

export interface PriceTable {
  version: string;
  webSearchPerRequest: number;
  models: Record<string, ModelPrice>;
  /** Stable hash of the effective table; stored with each session so a price change triggers a re-cost. */
  hash: string;
  /** Files that contributed (package table first, then user override). */
  sources: string[];
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

export function loadPricing(opts: { overridePath?: string | null } = {}): PriceTable {
  const base = path.join(packageRoot(), 'pricing.json');
  const sources = [base];
  const t = readTable(base);
  if (!t?.models) throw new Error(`pricing table unreadable: ${base}`);
  const models: Record<string, ModelPrice> = { ...t.models };
  const overridePath = opts.overridePath === undefined ? path.join(ccmeterHome(), 'pricing.json') : opts.overridePath;
  let webSearchPerRequest = t.webSearchPerRequest ?? 0.01;
  if (overridePath && fs.existsSync(overridePath)) {
    const o = readTable(overridePath);
    if (o?.models) {
      Object.assign(models, o.models);
      sources.push(overridePath);
    }
    if (typeof o?.webSearchPerRequest === 'number') webSearchPerRequest = o.webSearchPerRequest;
  }
  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify({ models, webSearchPerRequest }))
    .digest('hex')
    .slice(0, 12);
  return { version: t.version ?? 'unknown', webSearchPerRequest, models, hash, sources };
}

/** Resolve a transcript model id to a price: exact id, then without a trailing -YYYYMMDD date. */
export function lookupPrice(table: PriceTable, model: string): { id: string; price: ModelPrice } | null {
  const exact = table.models[model];
  if (exact) return { id: model, price: exact };
  const undated = model.replace(/-\d{8}$/, '');
  const hit = table.models[undated];
  if (hit) return { id: undated, price: hit };
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
  return usd;
}
