import { describe, expect, it } from 'vitest';
import { colorWanted, wordmark } from '../cli/brand.js';

const tty = { isTTY: true };
describe('cli wordmark', () => {
  it('is the plain word when piped, NO_COLOR is set, or TERM is dumb', () => {
    expect(wordmark({ isTTY: false }, {})).toBe('ccmeter');
    expect(wordmark({}, {})).toBe('ccmeter');
    expect(wordmark(tty, { NO_COLOR: '1' })).toBe('ccmeter');
    expect(wordmark(tty, { TERM: 'dumb' })).toBe('ccmeter');
    expect(wordmark(tty, { FORCE_COLOR: '0' })).toBe('ccmeter');
    expect(colorWanted(tty, {})).toBe(true);
  });

  it('is italic clay "cc" plus bold "meter" on a terminal, truecolor when announced', () => {
    const m = wordmark(tty, { TERM: 'xterm-256color' });
    expect(m).toContain('\x1b[38;5;173m\x1b[3mcc');
    expect(m).toContain('\x1b[1mmeter');
    expect(m.replace(/\x1b\[[0-9;]*m/g, '')).toBe('ccmeter');
    expect(wordmark(tty, { COLORTERM: 'truecolor' })).toContain('\x1b[38;2;217;119;87m');
  });
});
