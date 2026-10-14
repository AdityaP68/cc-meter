#!/usr/bin/env node
// Dev tool: turn a real Claude Code transcript into a sanitized fixture.
//   node scripts/make-fixture.mjs <in.jsonl> <out.jsonl> [--head N] [--around-events] [--strip-attachments-keep-types]
// Keeps: structure, every number/boolean/null, ids (uuid, msg_, req_, toolu_), timestamps, model names, versions.
// Redacts: every other string (prompts, replies, tool inputs/outputs, paths, titles, branch names, system prompts).
// Review the output before committing it. The goal is "no proprietary text", not "no information".
import fs from 'node:fs';

const [, , input, output, ...rest] = process.argv;
if (!input || !output) {
  console.error('usage: make-fixture.mjs <in> <out> [--head N] [--around-events]');
  process.exit(1);
}
const head = rest.includes('--head') ? Number(rest[rest.indexOf('--head') + 1]) : Infinity;
const aroundEvents = rest.includes('--around-events');

const ALLOW_KEYS = new Set([
  'type', 'subtype', 'role', 'model', 'advisorModel', 'requestedModel', 'modelId', 'id', 'uuid', 'parentUuid', 'logicalParentUuid',
  'requestId', 'timestamp', 'version', 'sessionId', 'entrypoint', 'stop_reason', 'stop_sequence', 'service_tier', 'speed',
  'inference_geo', 'operation', 'trigger', 'userType', 'permissionMode', 'promptId', 'agentId', 'promptSource', 'turnOrigin',
  'level', 'mode', 'effort', 'perTurnEffort', 'ephemeral', 'tool_use_id', 'toolUseID', 'headUuid', 'anchorUuid', 'tailUuid',
  'leafUuid', 'messageId', 'date', 'platform',
]);
const ID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|msg_\w+|req_\w+|toolu_\w+|a[0-9a-f]{16})$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;
const TAG_RE = /^\s*<([a-z][a-z-]*)>/;

function redactText(s) {
  const m = TAG_RE.exec(s);
  return m ? `<${m[1]}>[redacted]` : '[redacted]';
}

function clean(v, key, parent) {
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (key === 'cwd' || key === 'workingDirectory') return '/fixture/project';
    if (key === 'gitBranch') return 'main';
    if (key === 'customTitle' || key === 'aiTitle' || key === 'agentName' || key === 'title') return 'Fixture title';
    if (key === 'name' && parent && parent.type === 'tool_use') return 'Tool';
    if (key === 'content' && parent && (parent.role === 'user' || parent.type === 'tool_result')) return redactText(v);
    if (ID_RE.test(v) || TS_RE.test(v)) return v;
    if (ALLOW_KEYS.has(key) && v.length < 80) return v;
    return redactText(v);
  }
  if (Array.isArray(v)) return v.map((x) => clean(x, key, parent));
  if (typeof v === 'object') {
    if (key === 'attachment') return { type: v.type }; // drop attachment payloads (system prompts, tool lists, ...)
    if (key === 'input' && parent?.type === 'tool_use') return {};
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === 'rendered' || k === 'systemPrompt' || k === 'toolUseResult' || k === 'signature') continue;
      out[k] = clean(x, k, v);
    }
    return out;
  }
  return null;
}

// '\n' only: readline would split on U+2028 inside JSON strings
const lines = fs.readFileSync(input, 'utf8').split('\n').filter(Boolean);
const objs = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } });
const keep = new Set();
objs.forEach((o, i) => {
  if (!o) return;
  if (i < head) keep.add(i);
  if (aroundEvents && (o.subtype === 'compact_boundary' || o.isApiErrorMessage || o.message?.model === '<synthetic>' || o.type === 'cost-state'))
    for (let j = Math.max(0, i - 4); j <= i + 2; j++) keep.add(j);
});
const out = [];
[...keep].sort((a, b) => a - b).forEach((i) => objs[i] && out.push(JSON.stringify(clean(objs[i], '', null))));
fs.mkdirSync(output.replace(/\/[^/]*$/, ''), { recursive: true });
fs.writeFileSync(output, out.join('\n') + '\n');
console.log(`${input.split('/').pop()} -> ${output}: kept ${out.length}/${lines.length} lines, ${(fs.statSync(output).size / 1024).toFixed(1)} KB`);
