import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  decryptWithKey,
  deriveEncryptionKey,
  encryptWithKey,
  isEncryptedValue,
} from './credential-cipher';

const SECRET = 'test-secret';
const KEY = deriveEncryptionKey(SECRET);

/** Produce a legacy AES-256-CBC envelope exactly as the retired CryptoService did. */
function legacyCbcEncrypt(key: Buffer, value: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

describe('credential-cipher', () => {
  it('derives the historical sha256 key', () => {
    expect(KEY).toEqual(createHash('sha256').update(SECRET).digest());
    expect(KEY).toHaveLength(32);
  });

  it('round-trips through the GCM envelope', () => {
    const ciphertext = encryptWithKey(KEY, 'super-secret-token');
    expect(isEncryptedValue(ciphertext)).toBe(true);
    expect(decryptWithKey(KEY, ciphertext)).toBe('super-secret-token');
  });

  it('passes empty values through unchanged', () => {
    expect(encryptWithKey(KEY, '')).toBe('');
    expect(decryptWithKey(KEY, '')).toBe('');
  });

  it('treats non-envelope values as legacy plaintext', () => {
    expect(decryptWithKey(KEY, 'plain-oauth-token')).toBe('plain-oauth-token');
    expect(isEncryptedValue('plain-oauth-token')).toBe(false);
  });

  it('throws on GCM auth failure (wrong key)', () => {
    const ciphertext = encryptWithKey(KEY, 'secret');
    const wrongKey = deriveEncryptionKey('other-secret');
    expect(() => decryptWithKey(wrongKey, ciphertext)).toThrow();
  });

  it('throws on tampered GCM ciphertext', () => {
    const ciphertext = encryptWithKey(KEY, 'secret');
    const [iv, payload, tag] = ciphertext.split(':');
    const flipped = payload.startsWith('a')
      ? `b${payload.slice(1)}`
      : `a${payload.slice(1)}`;
    expect(() => decryptWithKey(KEY, `${iv}:${flipped}:${tag}`)).toThrow();
  });

  it('decrypts legacy CBC envelopes written by the retired CryptoService', () => {
    const legacy = legacyCbcEncrypt(KEY, 'legacy-bot-token');
    expect(isEncryptedValue(legacy)).toBe(false);
    expect(decryptWithKey(KEY, legacy)).toBe('legacy-bot-token');
  });

  it('returns legacy CBC values as-is when decryption fails (wrong key)', () => {
    const legacy = legacyCbcEncrypt(deriveEncryptionKey('other'), 'token');
    expect(decryptWithKey(KEY, legacy)).toBe(legacy);
  });
});
