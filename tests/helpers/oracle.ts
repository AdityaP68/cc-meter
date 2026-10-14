import fs from 'node:fs';
import path from 'node:path';

export interface OracleTotals {
  perModel: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number; messages: number }>;
  messages: number;
  total: { input: number; output: number; cacheWrite: number; cacheRead: number };
}

/**
 * Deliberately naive, independent re-implementation of "sum usage per message id (last entry wins)".
 * It shares no code with core/. Splits on '\n' only.
 */
export function oracle(files: string[]): OracleTotals {
  const last = new Map<string, any>();
  for (const f of files) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line) continue;
      let o: any;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      if (o.type !== 'assistant' || !o.message?.usage || o.message.model === '<synthetic>' || o.isApiErrorMessage) continue;
      last.set(o.message.id, o.message);
    }
  }
  const res: OracleTotals = { perModel: {}, messages: last.size, total: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 } };
  for (const m of last.values()) {
    const p = (res.perModel[m.model] ??= { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, messages: 0 });
    p.messages++;
    p.input += m.usage.input_tokens;
    p.output += m.usage.output_tokens;
    p.cacheWrite += m.usage.cache_creation_input_tokens;
    p.cacheRead += m.usage.cache_read_input_tokens;
    res.total.input += m.usage.input_tokens;
    res.total.output += m.usage.output_tokens;
    res.total.cacheWrite += m.usage.cache_creation_input_tokens;
    res.total.cacheRead += m.usage.cache_read_input_tokens;
  }
  return res;
}

export const subagentJsonl = (transcript: string): string[] => {
  const dir = path.join(path.dirname(transcript), path.basename(transcript, '.jsonl'), 'subagents');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')).sort().map((n) => path.join(dir, n)) : [];
};
