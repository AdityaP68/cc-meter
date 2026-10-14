import fs from 'node:fs';

/**
 * Split a JSONL transcript on '\n' only.
 * Do NOT use readline: it also splits on U+2028/U+2029, which appear unescaped inside JSON
 * strings in real transcripts and would corrupt those lines (see docs/FORMATS.md).
 */
export function splitLines(text: string): string[] {
  return text.split('\n');
}

export function readLines(file: string): string[] {
  return splitLines(fs.readFileSync(file, 'utf8'));
}
