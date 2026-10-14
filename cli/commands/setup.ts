import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../core/db.js';
import { ccmeterHome, claudeHome, ensureHome, packageRoot } from '../../core/paths.js';
import { loadPricing } from '../../core/pricing.js';
import { recordAll } from '../../core/record.js';
import type { Parsed } from '../args.js';

const MARKETPLACE = 'ccmeter';
const PLUGIN = 'ccmeter@ccmeter';

function claude(args: string[]): { ok: boolean; out: string } {
  try {
    const out = execFileSync('claude', args, { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim() };
  } catch (e: any) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || String(e.message ?? e) };
  }
}

/**
 * `ccmeter setup`: create ~/.ccmeter, remember where this CLI lives (for the hook launcher), register this package
 * as a local plugin marketplace, install the plugin, backfill history. Used by install.sh and by `npx ccmeter setup`.
 */
export async function cmdSetup(args: Parsed): Promise<number> {
  const root = packageRoot();
  const cli = fs.realpathSync(path.join(root, 'dist', 'cli', 'index.js'));

  if (args.flags.uninstall) {
    console.log(claude(['plugin', 'uninstall', PLUGIN]).out);
    console.log(claude(['plugin', 'marketplace', 'remove', MARKETPLACE]).out);
    console.log(`Plugin removed. Your data in ${ccmeterHome()} was left in place; delete it yourself if you want it gone.`);
    return 0;
  }

  const home = ensureHome();
  fs.writeFileSync(path.join(home, 'cli-path'), cli + '\n');
  const cfg = path.join(home, 'config.json');
  if (!fs.existsSync(cfg)) fs.writeFileSync(cfg, JSON.stringify({ port: 7337, openBrowser: false }, null, 2) + '\n');
  console.log(`✔ ${home} ready (hook launcher -> ${cli})`);

  if (!claude(['--version']).ok) {
    console.log('⚠ `claude` is not on PATH: skipped plugin install. Install Claude Code, then re-run `ccmeter setup`.');
  } else {
    const add = claude(['plugin', 'marketplace', 'add', root]);
    if (add.ok || /already/i.test(add.out)) console.log(`✔ marketplace "${MARKETPLACE}" registered (${root})`);
    else console.log(`⚠ could not register marketplace: ${add.out}`);
    const inst = claude(['plugin', 'install', PLUGIN]);
    if (inst.ok || /already/i.test(inst.out)) console.log(`✔ plugin ${PLUGIN} installed (hooks: Stop, SessionEnd, UserPromptSubmit for /ccmeter)`);
    else console.log(`⚠ could not install plugin: ${inst.out}`);
  }

  if (!args.flags['no-backfill']) {
    const db = openDb();
    const r = recordAll(db, loadPricing());
    db.close();
    console.log(`✔ backfilled ${r.recorded} sessions from ${path.join(claudeHome(), 'projects')} (${r.empty} had no assistant messages)`);
  }

  console.log(`
Optional: show live cost in Claude Code's status line by adding this to ~/.claude/settings.json
  "statusLine": { "type": "command", "command": "ccmeter statusline" }
(or run \`ccmeter setup --statusline\` and I'll add it if you have none).`);
  if (args.flags.statusline) installStatusline();
  console.log('\nDone. Run `ccmeter doctor` to verify, and `/ccmeter` in Claude Code (or `ccmeter serve --open`) for the dashboard.');
  return 0;
}

function installStatusline(): void {
  const file = path.join(claudeHome(), 'settings.json');
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* no settings yet */
  }
  if (json.statusLine) {
    console.log('ℹ a statusLine is already configured; left unchanged.');
    return;
  }
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.ccmeter-backup`);
  json.statusLine = { type: 'command', command: 'ccmeter statusline' };
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`✔ statusLine added to ${file} (backup: ${file}.ccmeter-backup)`);
}
