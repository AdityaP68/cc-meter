import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentLensHome, dbPath, legacyHome, migrateLegacyHome } from '../core/paths.js';
import { tmpDir } from './helpers/util.js';

const KEYS = ['AGENT_LENS_HOME', 'SESSIONSCOPE_HOME', 'CCMETER_HOME', 'HOME'] as const;
let saved: Record<string, string | undefined>;
let fakeHome: string;
const at = (...p: string[]) => path.join(fakeHome, ...p);
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  fakeHome = tmpDir('home-');
  for (const k of KEYS) delete process.env[k];
  process.env.HOME = fakeHome;
});
afterEach(() => {
  for (const k of KEYS) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
});

describe('home directory', () => {
  it('AGENT_LENS_HOME wins, then SESSIONSCOPE_HOME, then CCMETER_HOME (earlier names of this tool)', () => {
    process.env.CCMETER_HOME = '/ccmeter';
    expect(agentLensHome()).toBe('/ccmeter');
    process.env.SESSIONSCOPE_HOME = '/sessionscope';
    expect(agentLensHome()).toBe('/sessionscope');
    process.env.AGENT_LENS_HOME = '/new';
    expect(agentLensHome()).toBe('/new');
  });

  it('defaults to ~/.agent-lens, and reads ~/.sessionscope, then ~/.ccmeter, only while the new folder does not exist', () => {
    expect(agentLensHome()).toBe(at('.agent-lens'));
    expect(legacyHome()).toBeUndefined();
    fs.mkdirSync(at('.ccmeter'));
    expect(agentLensHome()).toBe(at('.ccmeter'));
    fs.mkdirSync(at('.sessionscope'));
    expect(agentLensHome()).toBe(at('.sessionscope'));
    expect(legacyHome()).toBe(at('.sessionscope'));
    fs.mkdirSync(at('.agent-lens'));
    expect(agentLensHome()).toBe(at('.agent-lens'));
  });

  it('the database is agent-lens.db, or the newest earlier file name the folder has', () => {
    const dir = tmpDir('db-');
    process.env.AGENT_LENS_HOME = dir;
    expect(dbPath()).toBe(path.join(dir, 'agent-lens.db'));
    fs.writeFileSync(path.join(dir, 'ccmeter.db'), 'x');
    expect(dbPath()).toBe(path.join(dir, 'ccmeter.db'));
    fs.writeFileSync(path.join(dir, 'sessionscope.db'), 'y');
    expect(dbPath()).toBe(path.join(dir, 'sessionscope.db'));
    fs.writeFileSync(path.join(dir, 'agent-lens.db'), 'z');
    expect(dbPath()).toBe(path.join(dir, 'agent-lens.db'));
  });
});

describe('migrateLegacyHome', () => {
  const seed = (dir: string, db: string) => {
    const old = at(dir);
    fs.mkdirSync(path.join(old, 'cache'), { recursive: true });
    fs.writeFileSync(path.join(old, db), 'db-bytes');
    fs.writeFileSync(path.join(old, db + '-wal'), 'wal-bytes');
    fs.writeFileSync(path.join(old, 'pricing.json'), '{}');
    fs.writeFileSync(path.join(old, 'server.json'), '{"pid":1}');
    fs.writeFileSync(path.join(old, 'cache', 'x'), 'x');
    return old;
  };

  it.each([
    ['.sessionscope', 'sessionscope.db'],
    ['.ccmeter', 'ccmeter.db'],
  ])('copies %s to ~/.agent-lens under the new database name and never touches the old folder', (dir, db) => {
    const old = seed(dir, db);
    const fresh = at('.agent-lens');
    expect(migrateLegacyHome()).toEqual({ status: 'copied', from: old, to: fresh });
    expect(fs.readFileSync(path.join(fresh, 'agent-lens.db'), 'utf8')).toBe('db-bytes');
    expect(fs.readFileSync(path.join(fresh, 'agent-lens.db-wal'), 'utf8')).toBe('wal-bytes');
    expect(fs.existsSync(path.join(fresh, db))).toBe(false);
    expect(fs.readFileSync(path.join(fresh, 'pricing.json'), 'utf8')).toBe('{}');
    expect(fs.existsSync(path.join(fresh, 'server.json'))).toBe(false);
    expect(fs.existsSync(path.join(fresh, 'cache'))).toBe(false);
    expect(fs.readFileSync(path.join(old, db), 'utf8')).toBe('db-bytes');
    expect(fs.existsSync(path.join(old, 'server.json'))).toBe(true);
  });

  it('prefers ~/.sessionscope over ~/.ccmeter when both exist', () => {
    seed('.ccmeter', 'ccmeter.db');
    const newer = seed('.sessionscope', 'sessionscope.db');
    expect(migrateLegacyHome().from).toBe(newer);
  });

  it('does nothing when the new folder exists, when there is no old one, or when a home is set by env', () => {
    expect(migrateLegacyHome().status).toBe('none');
    seed('.sessionscope', 'sessionscope.db');
    process.env.AGENT_LENS_HOME = tmpDir('explicit-');
    expect(migrateLegacyHome().status).toBe('skipped');
    delete process.env.AGENT_LENS_HOME;
    fs.mkdirSync(at('.agent-lens'));
    expect(migrateLegacyHome().status).toBe('exists');
    expect(fs.readdirSync(at('.agent-lens'))).toEqual([]);
  });
});
