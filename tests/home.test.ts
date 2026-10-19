import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ccmeterHome, dbPath, legacyHome, migrateLegacyHome } from '../core/paths.js';
import { tmpDir } from './helpers/util.js';

const KEYS = ['CCMETER_HOME', 'SESSIONSCOPE_HOME', 'AGENT_LENS_HOME', 'HOME'] as const;
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
  it('CCMETER_HOME wins, then AGENT_LENS_HOME, then SESSIONSCOPE_HOME (earlier names of this tool)', () => {
    process.env.SESSIONSCOPE_HOME = '/sessionscope';
    expect(ccmeterHome()).toBe('/sessionscope');
    process.env.AGENT_LENS_HOME = '/agent-lens';
    expect(ccmeterHome()).toBe('/agent-lens');
    process.env.CCMETER_HOME = '/new';
    expect(ccmeterHome()).toBe('/new');
  });

  it('defaults to ~/.ccmeter, and reads ~/.agent-lens, then ~/.sessionscope, only while the new folder does not exist', () => {
    expect(ccmeterHome()).toBe(at('.ccmeter'));
    expect(legacyHome()).toBeUndefined();
    fs.mkdirSync(at('.sessionscope'));
    expect(ccmeterHome()).toBe(at('.sessionscope'));
    fs.mkdirSync(at('.agent-lens'));
    expect(ccmeterHome()).toBe(at('.agent-lens'));
    expect(legacyHome()).toBe(at('.agent-lens'));
    fs.mkdirSync(at('.ccmeter'));
    expect(ccmeterHome()).toBe(at('.ccmeter'));
  });

  it('the database is ccmeter.db, or the newest earlier file name the folder has', () => {
    const dir = tmpDir('db-');
    process.env.CCMETER_HOME = dir;
    expect(dbPath()).toBe(path.join(dir, 'ccmeter.db'));
    fs.writeFileSync(path.join(dir, 'sessionscope.db'), 'x');
    expect(dbPath()).toBe(path.join(dir, 'sessionscope.db'));
    fs.writeFileSync(path.join(dir, 'agent-lens.db'), 'y');
    expect(dbPath()).toBe(path.join(dir, 'agent-lens.db'));
    fs.writeFileSync(path.join(dir, 'ccmeter.db'), 'z');
    expect(dbPath()).toBe(path.join(dir, 'ccmeter.db'));
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
    ['.agent-lens', 'agent-lens.db'],
    ['.sessionscope', 'sessionscope.db'],
  ])('copies %s to ~/.ccmeter under the new database name and never touches the old folder', (dir, db) => {
    const old = seed(dir, db);
    const fresh = at('.ccmeter');
    expect(migrateLegacyHome()).toEqual({ status: 'copied', from: old, to: fresh });
    expect(fs.readFileSync(path.join(fresh, 'ccmeter.db'), 'utf8')).toBe('db-bytes');
    expect(fs.readFileSync(path.join(fresh, 'ccmeter.db-wal'), 'utf8')).toBe('wal-bytes');
    expect(fs.existsSync(path.join(fresh, db))).toBe(false);
    expect(fs.readFileSync(path.join(fresh, 'pricing.json'), 'utf8')).toBe('{}');
    expect(fs.existsSync(path.join(fresh, 'server.json'))).toBe(false);
    expect(fs.existsSync(path.join(fresh, 'cache'))).toBe(false);
    expect(fs.readFileSync(path.join(old, db), 'utf8')).toBe('db-bytes');
    expect(fs.existsSync(path.join(old, 'server.json'))).toBe(true);
  });

  it('prefers ~/.agent-lens over ~/.sessionscope when both exist', () => {
    seed('.sessionscope', 'sessionscope.db');
    const newer = seed('.agent-lens', 'agent-lens.db');
    expect(migrateLegacyHome().from).toBe(newer);
  });

  it('does nothing when the new folder exists, when there is no old one, or when a home is set by env', () => {
    expect(migrateLegacyHome().status).toBe('none');
    seed('.agent-lens', 'agent-lens.db');
    process.env.CCMETER_HOME = tmpDir('explicit-');
    expect(migrateLegacyHome().status).toBe('skipped');
    delete process.env.CCMETER_HOME;
    fs.mkdirSync(at('.ccmeter'));
    expect(migrateLegacyHome().status).toBe('exists');
    expect(fs.readdirSync(at('.ccmeter'))).toEqual([]);
  });
});
