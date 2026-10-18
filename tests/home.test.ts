import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dbPath, legacyHome, migrateLegacyHome, sessionscopeHome } from '../core/paths.js';
import { tmpDir } from './helpers/util.js';

const KEYS = ['SESSIONSCOPE_HOME', 'CCMETER_HOME', 'HOME'] as const;
let saved: Record<string, string | undefined>;
let fakeHome: string;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  fakeHome = tmpDir('home-');
  delete process.env.SESSIONSCOPE_HOME;
  delete process.env.CCMETER_HOME;
  process.env.HOME = fakeHome;
});
afterEach(() => {
  for (const k of KEYS) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
});

describe('home directory', () => {
  it('SESSIONSCOPE_HOME wins; CCMETER_HOME is still honoured when it is the only one set', () => {
    process.env.CCMETER_HOME = '/old';
    expect(sessionscopeHome()).toBe('/old');
    process.env.SESSIONSCOPE_HOME = '/new';
    expect(sessionscopeHome()).toBe('/new');
  });

  it('defaults to ~/.sessionscope, reads ~/.ccmeter only while the new folder does not exist', () => {
    expect(sessionscopeHome()).toBe(path.join(fakeHome, '.sessionscope'));
    fs.mkdirSync(path.join(fakeHome, '.ccmeter'));
    expect(sessionscopeHome()).toBe(path.join(fakeHome, '.ccmeter'));
    expect(legacyHome()).toBe(path.join(fakeHome, '.ccmeter'));
    fs.mkdirSync(path.join(fakeHome, '.sessionscope'));
    expect(sessionscopeHome()).toBe(path.join(fakeHome, '.sessionscope'));
  });

  it('the database is sessionscope.db, or the old ccmeter.db when that is all the folder has', () => {
    const dir = tmpDir('db-');
    process.env.SESSIONSCOPE_HOME = dir;
    expect(dbPath()).toBe(path.join(dir, 'sessionscope.db'));
    fs.writeFileSync(path.join(dir, 'ccmeter.db'), 'x');
    expect(dbPath()).toBe(path.join(dir, 'ccmeter.db'));
    fs.writeFileSync(path.join(dir, 'sessionscope.db'), 'y');
    expect(dbPath()).toBe(path.join(dir, 'sessionscope.db'));
  });
});

describe('migrateLegacyHome', () => {
  const seed = () => {
    const old = path.join(fakeHome, '.ccmeter');
    fs.mkdirSync(path.join(old, 'cache'), { recursive: true });
    fs.writeFileSync(path.join(old, 'ccmeter.db'), 'db-bytes');
    fs.writeFileSync(path.join(old, 'ccmeter.db-wal'), 'wal-bytes');
    fs.writeFileSync(path.join(old, 'pricing.json'), '{}');
    fs.writeFileSync(path.join(old, 'config.json'), '{"port":7337}');
    fs.writeFileSync(path.join(old, 'server.json'), '{"pid":1}');
    fs.writeFileSync(path.join(old, 'cache', 'x'), 'x');
    return old;
  };

  it('copies data to ~/.sessionscope under the new database name and never touches the old folder', () => {
    const old = seed();
    const r = migrateLegacyHome();
    const fresh = path.join(fakeHome, '.sessionscope');
    expect(r).toEqual({ status: 'copied', from: old, to: fresh });
    expect(fs.readFileSync(path.join(fresh, 'sessionscope.db'), 'utf8')).toBe('db-bytes');
    expect(fs.readFileSync(path.join(fresh, 'sessionscope.db-wal'), 'utf8')).toBe('wal-bytes');
    expect(fs.existsSync(path.join(fresh, 'ccmeter.db'))).toBe(false);
    expect(fs.readFileSync(path.join(fresh, 'pricing.json'), 'utf8')).toBe('{}');
    expect(fs.existsSync(path.join(fresh, 'server.json'))).toBe(false);
    expect(fs.existsSync(path.join(fresh, 'cache'))).toBe(false);
    expect(fs.readFileSync(path.join(old, 'ccmeter.db'), 'utf8')).toBe('db-bytes');
    expect(fs.existsSync(path.join(old, 'server.json'))).toBe(true);
  });

  it('does nothing when the new folder exists, when there is no old one, or when a home is set by env', () => {
    expect(migrateLegacyHome().status).toBe('none');
    seed();
    process.env.SESSIONSCOPE_HOME = tmpDir('explicit-');
    expect(migrateLegacyHome().status).toBe('skipped');
    delete process.env.SESSIONSCOPE_HOME;
    fs.mkdirSync(path.join(fakeHome, '.sessionscope'));
    expect(migrateLegacyHome().status).toBe('exists');
    expect(fs.readdirSync(path.join(fakeHome, '.sessionscope'))).toEqual([]);
  });
});
