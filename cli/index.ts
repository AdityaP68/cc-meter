#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { packageRoot } from '../core/paths.js';
import { parseArgs } from './args.js';
import { wordmark } from './brand.js';

const HELP = `ccmeter — local-first usage and cost tracker for Claude Code

  ccmeter record [--all | --transcript <file> | --session <id>] [--force]
        Record sessions into ~/.ccmeter. With no flags it reads a Claude Code hook payload on stdin (silent).
  ccmeter report [--session <id>] [--by day|project|model] [--since 7d] [--project p] [--model m] [--limit n] [--json]
  ccmeter doctor [--verify-pricing] [--json]
  ccmeter export [--format json|csv] [--messages] [--out file]
  ccmeter serve [--port n] [--open] [--ensure] [--stop]     local dashboard on 127.0.0.1
  ccmeter statusline                                         Claude Code statusLine command (reads JSON on stdin)
  ccmeter setup [--no-backfill] [--statusline] [--uninstall]   register the plugin, create ~/.ccmeter, backfill history
  ccmeter review <session-id> [--model m] [--dry-run | --show-input] [--force] [--json] [--yes]
        Prompt and workflow review of one session by a Claude model (via claude -p). On demand only; prints the estimated
        cost first and asks consent before the first review, because prompt text leaves the machine.

Everything is local: reads ~/.claude, writes ~/.ccmeter. No network calls.`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1), ['all', 'force', 'json', 'open', 'ensure', 'stop', 'messages', 'verify-pricing', 'quiet', 'uninstall', 'statusline', 'no-backfill', 'dry-run', 'show-input', 'yes', 'accept-data-leaves-machine']);
  switch (cmd) {
    case 'record':
      return (await import('./commands/record.js')).cmdRecord(args);
    case 'report':
      return (await import('./commands/report.js')).cmdReport(args);
    case 'doctor':
      return (await import('./commands/doctor.js')).cmdDoctor(args);
    case 'export':
      return (await import('./commands/export.js')).cmdExport(args);
    case 'serve':
      return (await import('./commands/serve.js')).cmdServe(args);
    case 'statusline':
      return (await import('./commands/statusline.js')).cmdStatusline(args);
    case 'setup':
      return (await import('./commands/setup.js')).cmdSetup(args);
    case 'review':
      return (await import('./commands/review.js')).cmdReview(args);
    case '--version':
    case 'version':
      console.log(JSON.parse(fs.readFileSync(path.join(packageRoot(), 'package.json'), 'utf8')).version);
      return 0;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP.replace(/^ccmeter/, wordmark()));
      return 0;
    default:
      console.error(`unknown command: ${cmd}\n\n${HELP.replace(/^ccmeter/, wordmark(process.stderr))}`);
      return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
