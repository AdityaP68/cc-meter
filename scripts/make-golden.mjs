#!/usr/bin/env node
// Dev tool: (re)generate fixtures/**/<name>.expected.json from the CURRENT parser.
// Review the diff by hand: tests/golden.test.ts independently re-checks token totals with a naive oracle
// and, where a fixture carries Claude Code's own cost-state, against that too.
import fs from 'node:fs';
import path from 'node:path';
import { parseSession } from '../dist/core/record.js';
import { loadPricing } from '../dist/core/pricing.js';

const root = path.resolve(import.meta.dirname, '..', 'fixtures');
const table = loadPricing({ overridePath: null });
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.jsonl') && !p.includes(`${path.sep}subagents${path.sep}`)) files.push(p);
  }
})(root);

for (const f of files) {
  const s = parseSession(f, table);
  const r6 = (n) => Math.round(n * 1e6) / 1e6;
  const exp = {
    parserStatus: s.parserStatus,
    ccVersions: s.ccVersions,
    turns: s.turns,
    messages: s.messageCount,
    sidechainMessages: s.sidechainMessageCount,
    partialMessages: s.partialMessages,
    tokens: s.tokens,
    sidechainTokens: s.sidechainTokens,
    costUsd: r6(s.costUsd),
    models: s.models.map((m) => ({ model: m.model, messages: m.messages, input: m.input, output: m.output, cacheWrite: m.cacheWrite, cacheRead: m.cacheRead, cost: r6(m.cost) })),
    switches: s.switches.map((x) => ({ from: x.from, to: x.to, turn: x.turn })),
    compactions: s.compactions.map((c) => ({ trigger: c.trigger, preTokens: c.preTokens, postTokens: c.postTokens, turn: c.turn })),
    unpricedModels: s.unpricedModels,
    stats: { duplicatesCollapsed: s.stats.duplicatesCollapsed, syntheticIgnored: s.stats.syntheticIgnored, unparsable: s.stats.unparsable, unknownTypes: s.stats.unknownTypes },
  };
  fs.writeFileSync(f.replace(/\.jsonl$/, '.expected.json'), JSON.stringify(exp, null, 2) + '\n');
  console.log(path.relative(root, f), `msgs=${exp.messages} side=${exp.sidechainMessages} partial=${exp.partialMessages} turns=${exp.turns} switches=${exp.switches.length} compactions=${exp.compactions.length} cost=$${exp.costUsd}`);
}
