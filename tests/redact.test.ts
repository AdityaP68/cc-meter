import { describe, expect, it } from 'vitest';
import { redact } from '../core/redact.js';

describe('redact', () => {
  it('removes secrets, emails and home paths before text can enter a judge prompt', () => {
    const anth = ['sk', 'ant', 'api03', 'AbCdEfGhIjKlMnOp'].join('-');
    const home = ['', 'Us' + 'ers', 'jane', ''].join('/');
    const t = [
      `key ${anth} and ghp_abcdefghijklmnopqrstuvwxyz0123456789`,
      `mail me at jane.doe@example.com, path ${home}work/app/src/x.ts`,
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def',
      'AKIAABCDEFGHIJKLMNOP password=hunter2 token: "abcd1234efgh5678ijkl"',
      'long hex 0123456789abcdef0123456789abcdef0123',
    ].join('\n');
    const r = redact(t);
    for (const bad of ['sk-ant-api03', 'ghp_abc', 'jane.doe@', home, 'eyJhbGci', 'AKIAABCD', 'hunter2', 'abcd1234efgh', '0123456789abcdef0123456789abcdef']) expect(r).not.toContain(bad);
    expect(r).toContain('[redacted:key]');
    expect(r).toContain('[redacted:email]');
    expect(r).toContain('~/work/app/src/x.ts');
  });

  it('masks a bare home directory, private-key blocks, URL credentials and spoken passwords', () => {
    const home = ['', 'Us' + 'ers', 'bob'].join('/');
    const url = ['postgres://admin', 'pw12345' + '@db.internal:5432/app'].join(':');
    const pem = ['-----BEGIN RSA PRIVATE KEY-----', 'MIIEowIBAAKCAQEA', '-----END RSA PRIVATE KEY-----'].join('\n');
    const r = redact(`cd ${home} then ${url} and ${pem} and password is hunter2xx`);
    for (const bad of ['bob', 'admin', 'pw12345', 'MIIEow', 'hunter2xx']) expect(r).not.toContain(bad);
  });

  it('leaves ordinary prose and short identifiers alone', () => {
    const t = 'Please rename getUser to fetchUser in src/api.ts and run the tests (v2.1.3, 42 files).';
    expect(redact(t)).toBe(t);
  });
});
