import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasLegacyStatusline, installStatusline } from '../cli/commands/setup.js';
import { tmpDir } from './helpers/util.js';

let dir: string;
let file: string;
beforeEach(() => {
  dir = tmpDir('claude-');
  file = path.join(dir, 'settings.json');
  process.env.CLAUDE_CONFIG_DIR = dir;
});
afterEach(() => {
  delete process.env.CLAUDE_CONFIG_DIR;
});

describe('setup --statusline', () => {
  it('refuses to touch a settings.json it cannot parse', () => {
    const original = '{ "permissions": { "allow": ["Bash(ls)"], // a comment\n}';
    fs.writeFileSync(file, original);
    expect(installStatusline()).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
    expect(fs.existsSync(`${file}.ccmeter-backup`)).toBe(false);
  });

  it('refuses a settings.json that is valid JSON but not an object', () => {
    fs.writeFileSync(file, '[1, 2]');
    expect(installStatusline()).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('[1, 2]');
  });

  it('adds the statusLine to a valid file, keeps the rest and leaves a backup', () => {
    fs.writeFileSync(file, JSON.stringify({ model: 'x' }));
    expect(installStatusline()).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ model: 'x', statusLine: { type: 'command', command: 'ccmeter statusline' } });
    expect(JSON.parse(fs.readFileSync(`${file}.ccmeter-backup`, 'utf8'))).toEqual({ model: 'x' });
  });

  it('creates the file when there is none, and leaves an existing statusLine alone', () => {
    expect(installStatusline()).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).statusLine.command).toBe('ccmeter statusline');
    fs.writeFileSync(file, JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }));
    expect(installStatusline()).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).statusLine.command).toBe('mine');
  });

  it.each(['agent-lens statusline', 'sessionscope statusline'])('replaces the status line command %s from an earlier name and backs the file up', (old) => {
    fs.writeFileSync(file, JSON.stringify({ statusLine: { type: 'command', command: old } }));
    expect(hasLegacyStatusline()).toBe(true);
    expect(installStatusline()).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).statusLine.command).toBe('ccmeter statusline');
    expect(JSON.parse(fs.readFileSync(`${file}.ccmeter-backup`, 'utf8')).statusLine.command).toBe(old);
    expect(hasLegacyStatusline()).toBe(false);
  });
});
