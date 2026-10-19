import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_IDLE_MINUTES, readConfig } from '../cli/commands/serve.js';
import { openDb } from '../core/db.js';
import { loadPricing } from '../core/pricing.js';
import { startServer } from '../server/index.js';
import { tmpDir } from './helpers/util.js';

afterEach(() => {
  delete process.env.CCMETER_HOME;
});

describe('background server idle stop', () => {
  it('defaults to 30 minutes, honours config.json, and falls back on a bad value', () => {
    expect(DEFAULT_IDLE_MINUTES).toBe(30);
    process.env.CCMETER_HOME = tmpDir();
    expect(readConfig().idleMinutes).toBe(30);
    const write = (c: unknown) => fs.writeFileSync(path.join(process.env.CCMETER_HOME!, 'config.json'), JSON.stringify(c));
    write({ idleMinutes: 5 });
    expect(readConfig().idleMinutes).toBe(5);
    write({ idleMinutes: 0 }); // 0 disables the stop
    expect(readConfig().idleMinutes).toBe(0);
    write({ idleMinutes: 'soon' });
    expect(readConfig().idleMinutes).toBe(30);
    write({ idleMinutes: -3 });
    expect(readConfig().idleMinutes).toBe(30);
  });

  it('calls onIdle once the idle time passes without a request', async () => {
    let idle = 0;
    const srv = await startServer({ port: 0, db: openDb(':memory:'), table: loadPricing({ overridePath: null }), staticDir: tmpDir('static-'), skipExternalChecks: true, idleMs: 150, onIdle: () => { idle++; } });
    try {
      const t = Date.now();
      while (!idle && Date.now() - t < 3000) await new Promise((r) => setTimeout(r, 25));
      expect(idle).toBeGreaterThan(0);
    } finally {
      await srv.close();
    }
  });
});
