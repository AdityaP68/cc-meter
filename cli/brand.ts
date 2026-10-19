/**
 * The ccmeter wordmark for terminal output: italic clay "cc" + "meter", the same as the dashboard header. Colour only when the
 * stream is a terminal that wants it (not piped, NO_COLOR unset, TERM not "dumb"); otherwise the plain word, so `| grep` and
 * logs never see escape codes. Never used by --json output, `record`, hooks or the status line.
 */
export function colorWanted(stream: { isTTY?: boolean } = process.stdout, env: NodeJS.ProcessEnv = process.env): boolean {
  return !!stream.isTTY && !env.NO_COLOR && env.TERM !== 'dumb' && env.FORCE_COLOR !== '0';
}

export function wordmark(stream: { isTTY?: boolean } = process.stdout, env: NodeJS.ProcessEnv = process.env): string {
  if (!colorWanted(stream, env)) return 'ccmeter';
  const truecolor = /truecolor|24bit/i.test(env.COLORTERM ?? '');
  const clay = truecolor ? '\x1b[38;2;217;119;87m' : '\x1b[38;5;173m';
  return `${clay}\x1b[3mcc\x1b[0m\x1b[1mmeter\x1b[0m`;
}
