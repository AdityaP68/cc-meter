import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROOT } from './helpers/util.js';

const STDIN_JS = pathToFileURL(path.join(ROOT, '.test-dist', 'cli', 'stdin.js')).href;

/**
 * Run readStdinText in a child whose fd 0 is a NON-BLOCKING pipe (touching process.stdin does that), write `payload`
 * after `delayMs` (or never, if null), and return what the child read and how long it took.
 */
function readInChild(payload: string | null, delayMs: number, timeoutMs: number): Promise<{ out: string; ms: number }> {
  const code = `void process.stdin.isTTY; const { readStdinText } = await import(${JSON.stringify(STDIN_JS)});
const fs = await import('node:fs'); const t0 = Date.now(); const s = readStdinText(${timeoutMs});
fs.writeSync(1, JSON.stringify({ s, ms: Date.now() - t0 })); process.exit(0);`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['pipe', 'pipe', 'inherit'] });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  if (payload !== null) setTimeout(() => child.stdin.end(payload), delayMs);
  return new Promise((resolve) =>
    child.on('close', () => {
      child.stdin.destroy();
      const j = JSON.parse(out);
      resolve({ out: j.s, ms: j.ms });
    }),
  );
}

describe('readStdinText', () => {
  it('retries EAGAIN on a non-blocking fd 0 until the late payload arrives', async () => {
    const payload = JSON.stringify({ hook_event_name: 'Stop', transcript_path: '/x.jsonl', pad: 'p'.repeat(200_000) });
    const r = await readInChild(payload, 300, 5000);
    expect(r.out).toBe(payload);
  });

  it('gives up at the deadline when nothing is ever written', async () => {
    const r = await readInChild(null, 0, 200);
    expect(r.out).toBe('');
    expect(r.ms).toBeGreaterThanOrEqual(200);
    expect(r.ms).toBeLessThan(3000);
  });
});
