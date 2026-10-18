#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { packageRoot } from '../core/paths.js';
import { parseArgs } from './args.js';

const HELP = `agent-lens — local-first usage and cost tracker for Claude Code

  agent-lens record [--all | --transcript <file> | --session <id>] [--force]
        Record sessions into ~/.agent-lens. With no flags it reads a Claude Code hook payload on stdin (silent).
  agent-lens report [--session <id>] [--by day|project|model] [--since 7d] [--project p] [--model m] [--limit n] [--json]
  agent-lens doctor [--verify-pricing] [--json]
  agent-lens export [--format json|csv] [--messages] [--out file]
  agent-lens serve [--port n] [--open] [--ensure] [--stop]     local dashboard on 127.0.0.1
  agent-lens statusline                                         Claude Code statusLine command (reads JSON on stdin)
  agent-lens setup [--no-backfill] [--statusline] [--uninstall]   register the plugin, create ~/.agent-lens, backfill history
  agent-lens review <session-id>                                (milestone 3, not implemented)

Everything is local: reads ~/.claude, writes ~/.agent-lens. No network calls.`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1), ['all', 'force', 'json', 'open', 'ensure', 'stop', 'messages', 'verify-pricing', 'quiet', 'uninstall', 'statusline', 'no-backfill']);
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
      console.error('agent-lens review is milestone 3 and is not implemented yet. See docs/ARCHITECTURE.md.');
      return 1;
    case '--version':
    case 'version':
      console.log(JSON.parse(fs.readFileSync(path.join(packageRoot(), 'package.json'), 'utf8')).version);
      return 0;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return 0;
    default:
      console.error(`unknown command: ${cmd}\n\n${HELP}`);
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
