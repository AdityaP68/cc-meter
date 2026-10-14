import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const FIXTURES = path.join(ROOT, 'fixtures');
/** Built CLI used by tests: .test-dist/ (from `pretest`), never the live dist/ that the user's hooks run. */
export const CLI_JS = path.join(ROOT, '.test-dist', 'cli', 'index.js');

export function tmpDir(prefix = 'ccmeter-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Copy a fixture (and its <id>/subagents dir if present) into a fake ~/.claude/projects/<proj>/ and return the transcript path. */
export function installFixture(rel: string, into: string, project = '-fixture-project', asName?: string): string {
  const src = path.join(FIXTURES, rel);
  const dir = path.join(into, 'projects', project);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, asName ?? path.basename(src));
  fs.copyFileSync(src, dest);
  const sub = src.replace(/\.jsonl$/, '');
  if (fs.existsSync(sub)) fs.cpSync(sub, dest.replace(/\.jsonl$/, ''), { recursive: true });
  return dest;
}

export const allFixtures = (): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'subagents') walk(p);
      } else if (e.name.endsWith('.jsonl')) out.push(path.relative(FIXTURES, p));
    }
  };
  walk(FIXTURES);
  return out.sort();
};

/** Build a transcript line for tests. */
export function asst(o: {
  id: string;
  model?: string;
  ts?: string;
  input?: number;
  output?: number;
  cw?: number;
  cw1h?: number;
  cr?: number;
  stop?: string | null;
  sidechain?: boolean;
  agentId?: string;
  extra?: Record<string, unknown>;
  usageExtra?: Record<string, unknown>;
}): string {
  return JSON.stringify({
    parentUuid: null,
    isSidechain: !!o.sidechain,
    type: 'assistant',
    uuid: `u-${o.id}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: o.ts ?? '2026-01-01T00:00:00.000Z',
    sessionId: 's1',
    version: '2.1.287',
    cwd: '/work/proj',
    ...(o.agentId ? { agentId: o.agentId } : {}),
    message: {
      id: o.id,
      model: o.model ?? 'claude-sonnet-5-5',
      role: 'assistant',
      type: 'message',
      content: [{ type: 'text', text: 'x' }],
      stop_reason: o.stop === undefined ? 'end_turn' : o.stop,
      usage: {
        input_tokens: o.input ?? 0,
        output_tokens: o.output ?? 0,
        cache_creation_input_tokens: o.cw ?? 0,
        cache_read_input_tokens: o.cr ?? 0,
        cache_creation: { ephemeral_5m_input_tokens: (o.cw ?? 0) - (o.cw1h ?? 0), ephemeral_1h_input_tokens: o.cw1h ?? 0 },
        ...(o.usageExtra ?? {}),
      },
    },
    ...(o.extra ?? {}),
  });
}

export function user(text: string | unknown[], ts = '2026-01-01T00:00:00.000Z', extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    type: 'user',
    uuid: `u-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: ts,
    sessionId: 's1',
    version: '2.1.287',
    cwd: '/work/proj',
    message: { role: 'user', content: text },
    ...extra,
  });
}
