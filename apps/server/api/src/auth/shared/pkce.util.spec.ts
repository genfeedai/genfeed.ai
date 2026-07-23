import { createHash } from 'node:crypto';
import {
  buildCodeChallenge,
  hashToken,
  safeEqual,
  toBase64Url,
} from './pkce.util';

describe('PKCE utilities', () => {
  it('builds the RFC 7636 S256 challenge', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(buildCodeChallenge(verifier)).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('hashes persisted tokens without retaining the raw value', () => {
    expect(hashToken('secret-code')).toBe(
      createHash('sha256').update('secret-code').digest('hex'),
    );
  });

  it('compares equal-length values safely and rejects length mismatches', () => {
    expect(safeEqual('same', 'same')).toBe(true);
    expect(safeEqual('same', 'different')).toBe(false);
    expect(safeEqual('short', 'longer')).toBe(false);
  });

  it('encodes buffers without base64 padding', () => {
    expect(toBase64Url(Buffer.from([251, 255]))).toBe('-_8');
  });
});
