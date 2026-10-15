import fs from 'node:fs';
import tty from 'node:tty';

const pause = new Int32Array(new SharedArrayBuffer(4));

/**
 * Read a hook payload from fd 0 until EOF. Returns '' for a terminal.
 *
 * Never touch `process.stdin` before this: on a pipe it opens fd 0 as a non-blocking stream, and a sync read that runs
 * before Claude Code has written then fails with EAGAIN (reproduced 2026-10-15). EAGAIN is retried every 10 ms for up to
 * `timeoutMs`, so a non-blocking fd 0 from any source is read correctly. A blocking fd 0 whose writer never closes still
 * blocks, as before (the hook's own timeout ends it). On timeout or another error, returns what was read so far.
 */
export function readStdinText(timeoutMs = 5000, fd = 0): string {
  if (tty.isatty(fd)) return '';
  const chunks: Buffer[] = [];
  const buf = Buffer.alloc(64 * 1024);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let n: number;
    try {
      n = fs.readSync(fd, buf, 0, buf.length, null);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EAGAIN' && Date.now() < deadline) {
        Atomics.wait(pause, 0, 0, 10);
        continue;
      }
      break;
    }
    if (n === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks).toString('utf8');
}
