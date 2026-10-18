import fs from 'node:fs';
import path from 'node:path';
import { sessionscopeHome } from '../../core/paths.js';
import { loadPricing } from '../../core/pricing.js';
import { parseSession, transcriptSignature } from '../../core/record.js';
import { totalTokens } from '../../core/session.js';
import type { Parsed } from '../args.js';
import { tok, usd } from '../format.js';

interface Cached {
  sig: string;
  pricing: string;
  cost: number;
  tokens: number;
  unpriced: boolean;
  /** Models in this session without a price (absent in caches written before 2026-10-15: recompute). */
  unpricedModels?: string[];
}

/**
 * Claude Code statusLine command: `model | session cost | tokens`, plus `⚠ unpriced: <model>` when this session used a
 * model with no price.
 * stdin JSON has the model name and Claude Code's own cost estimate, but only the *current-context* token counts;
 * cumulative tokens and sessionscope's cost come from the transcript, cached by file size+mtime so repeated refreshes are free.
 * Never throws and never prints to stderr: a broken status line must not disturb the session.
 */
export async function cmdStatusline(_args: Parsed): Promise<number> {
  let input: any = {};
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    /* no/garbled stdin */
  }
  const model: string = input?.model?.display_name ?? input?.model?.id ?? 'Claude';
  let cost: number | null = null;
  let tokens: number | null = null;
  let unpriced = false;
  let unpricedModels: string[] = [];
  try {
    const tp: string | undefined = input?.transcript_path;
    if (tp && fs.existsSync(tp)) {
      const table = loadPricing();
      const sig = transcriptSignature(tp) ?? '';
      const cacheDir = path.join(sessionscopeHome(), 'cache');
      const cacheFile = path.join(cacheDir, `statusline-${path.basename(tp, '.jsonl')}.json`);
      let c: Cached | null = null;
      try {
        c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      } catch {
        /* miss */
      }
      if (!c || c.sig !== sig || c.pricing !== table.hash || !Array.isArray(c.unpricedModels)) {
        const s = parseSession(tp, table);
        if (s) {
          c = { sig, pricing: table.hash, cost: s.costUsd, tokens: totalTokens(s.tokens), unpriced: s.unpricedTokens > 0, unpricedModels: s.unpricedModels };
          fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(cacheFile, JSON.stringify(c));
        }
      }
      if (c) ({ cost, tokens, unpriced } = c), (unpricedModels = c.unpricedModels ?? []);
    }
  } catch {
    /* fall through to stdin values */
  }
  if (cost === null && typeof input?.cost?.total_cost_usd === 'number') cost = input.cost.total_cost_usd;
  const parts = [model, cost === null ? '$–' : `${usd(cost)}${unpriced ? '+?' : ''}`, tokens === null ? '– tok' : `${tok(tokens)} tok`];
  if (unpricedModels.length) parts.push(`⚠ unpriced: ${unpricedModels.join(',')}`); // fix: ~/.sessionscope/pricing.json or `sessionscope doctor`
  process.stdout.write(parts.join(' | ') + '\n');
  return 0;
}
