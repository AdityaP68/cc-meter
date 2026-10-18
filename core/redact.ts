/**
 * Local redaction applied to every span of user text before it can enter a judge prompt (ADR 0009 row 6).
 * Best effort and pattern based: it removes the common secret shapes, emails and home-directory prefixes. It cannot
 * recognise a secret that has no recognisable shape or an unusual path, which is why the consent prompt still says that text leaves the machine.
 */
const RULES: [RegExp, string][] = [
  [/sk-ant-[A-Za-z0-9_-]{8,}/g, '[redacted:key]'],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, '[redacted:key]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[redacted:key]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[redacted:key]'],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[redacted:key]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted:key]'],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[redacted:key]'],
  [/\b(password|passwd|secret|token|api[_-]?key|apikey)(\s*[:=]\s*)(["']?)[^\s"',;]{6,}\3/gi, '$1$2[redacted:key]'],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[redacted:credentials]@'],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[redacted:email]'],
  [/\b[0-9a-fA-F]{32,}\b/g, '[redacted:key]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[redacted:key]'],
  [/\b(password|passwd|passphrase)\s+(?:is|=|:)\s*\S+/gi, '$1 [redacted:key]'],
  [/(?:\/Users|\/home)\/[A-Za-z0-9._-]+(?:\/|\b)/g, '~/'],
  [/[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\/g, '~\\'],
];

export function redact(text: string): string {
  let out = text;
  for (const [re, to] of RULES) out = out.replace(re, to);
  return out;
}
