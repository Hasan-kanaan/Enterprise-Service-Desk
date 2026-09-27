import { validPassword } from '../auth/password';
import {
  initialSetupSecret,
  jwtSecret,
  proxyTrust,
  deployedMode,
} from './security.config';
import { validateUpload } from '../tickets/attachment-storage';

describe('Fail-closed configuration and password boundaries', () => {
  it.each([undefined, '', 'production', 'staging', 'prod', 'Development'])(
    'fails closed for mode %s',
    (NODE_ENV) => {
      expect(deployedMode({ NODE_ENV })).toBe(true);
      for (const JWT_SECRET of [
        undefined,
        'dev-secret-change-me',
        'a'.repeat(64),
        'short',
      ])
        expect(() => jwtSecret({ NODE_ENV, JWT_SECRET })).toThrow();
    },
  );
  it.each(['development', 'test'])(
    'allows explicit %s defaults',
    (NODE_ENV) => {
      expect(jwtSecret({ NODE_ENV })).toBe('dev-secret-change-me');
      expect(deployedMode({ NODE_ENV })).toBe(false);
    },
  );
  it('never supplies a bootstrap default, even in tests', () => {
    expect(() => initialSetupSecret({ NODE_ENV: 'test' })).toThrow();
  });
  it('restricts proxy configuration', () => {
    expect(proxyTrust({})).toBe(false);
    expect(proxyTrust({ TRUST_PROXY: '1' })).toBe(1);
    expect(proxyTrust({ TRUST_PROXY: '127.0.0.1/8,::1' })).toEqual([
      '127.0.0.1/8',
      '::1',
    ]);
    for (const TRUST_PROXY of ['true', '*', '-1', '127.0.0.1/33'])
      expect(() => proxyTrust({ TRUST_PROXY })).toThrow();
  });
  it('limits UTF-8 bytes without losing the existing minimum', () => {
    expect(validPassword('a'.repeat(72))).toBe(true);
    expect(validPassword('a'.repeat(73))).toBe(false);
    expect(validPassword('é'.repeat(36))).toBe(true);
    expect(validPassword('é'.repeat(37))).toBe(false);
    expect(validPassword('😀'.repeat(18))).toBe(true);
    expect(validPassword('😀'.repeat(19))).toBe(false);
    expect(validPassword('short')).toBe(false);
  });
});

describe('CSV spreadsheet safety', () => {
  function upload(text: string, extension = 'csv') {
    const buffer = Buffer.from(text);
    return validateUpload({
      originalname: `data.${extension}`,
      mimetype: extension === 'csv' ? 'text/csv' : 'text/plain',
      buffer,
      size: buffer.length,
    });
  }
  it.each([
    'name,count\r\nAlice,3',
    '\uFEFFname,"notes"\nBob,"hello, world"',
    'name;count\nBob;3',
    'name,"a ""quote"""',
  ])('accepts safe CSV %s', (text) => {
    expect(() => upload(text)).not.toThrow();
  });
  it.each([
    '=1+1',
    '+1',
    '-2',
    '@SUM(A1)',
    '＝1',
    '＋2',
    '－3',
    '＠A1',
    ' \t=1',
    '\uFEFF=1',
    '"=1"',
    'a,"  =1"',
    'a;=1',
    'a\t=1',
    'a,"\n=1"',
    'a,"\ttext"',
  ])('rejects unsafe CSV %s', (text) => {
    expect(() => upload(text)).toThrow('unsafe spreadsheet');
  });
  it.each(['txt', 'log'])('leaves %s rules unchanged', (extension) => {
    expect(() => upload('=hello\n+text', extension)).not.toThrow();
  });
});
