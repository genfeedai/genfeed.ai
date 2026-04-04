import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';

describe('EncryptionUtil', () => {
  beforeAll(() => {
    if (!process.env.TOKEN_ENCRYPTION_KEY) {
      process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-secret';
    }
  });

  it('encrypts and decrypts with AES-256-GCM', () => {
    const value = 'refresh_token_value';

    const encrypted = EncryptionUtil.encrypt(value);
    const decrypted = EncryptionUtil.decrypt(encrypted);

    expect(encrypted).not.toBe(value);
    expect(encrypted.split(':')).toHaveLength(3);
    expect(decrypted).toBe(value);
  });

  it('returns the same value when input is empty', () => {
    expect(EncryptionUtil.encrypt('')).toBe('');
    expect(EncryptionUtil.decrypt('')).toBe('');
  });
});
