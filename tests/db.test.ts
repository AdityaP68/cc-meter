import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { LATEST_SCHEMA, migrate, schemaVersion } from '../core/db.js';
import { tmpDir } from './helpers/util.js';

describe('migrate', () => {
  it('is safe when another process migrates between our version check and our transaction', () => {
    const file = path.join(tmpDir(), 'race.db');
    const a = new DatabaseSync(file);
    const b = new DatabaseSync(file);
    a.exec('PRAGMA busy_timeout = 5000');
    b.exec('PRAGMA busy_timeout = 5000');
    // A's first version read is stale: another process finishes migrating right after A reads user_version = 0.
    let raced = false;
    const racy = new Proxy(a, {
      get(target, prop) {
        const v = Reflect.get(target, prop, target) as unknown;
        if (prop !== 'prepare' || typeof v !== 'function') return typeof v === 'function' ? v.bind(target) : v;
        return (sql: string) => {
          if (!raced && sql === 'PRAGMA user_version') {
            raced = true;
            migrate(b);
            return { get: () => ({ user_version: 0 }) };
          }
          return (v as (s: string) => unknown).call(target, sql);
        };
      },
    });
    expect(() => migrate(racy)).not.toThrow();
    expect(raced).toBe(true);
    expect(schemaVersion(a)).toBe(LATEST_SCHEMA);
    a.close();
    b.close();
  });

  it('is idempotent', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    migrate(db);
    expect(schemaVersion(db)).toBe(LATEST_SCHEMA);
    db.close();
  });
});
