import process from 'node:process';
import {
  CREDENTIAL_SECRET_FIELDS,
  CredentialCryptoService,
} from '@api/collections/credentials/services/credential-crypto.service';
import { ConfigService } from '@libs/config/config.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';

// Use the same key the global test setup gives EncryptionUtil so the
// interop assertions (cross-decrypt) are meaningful.
const KEY =
  process.env.TOKEN_ENCRYPTION_KEY ?? 'test-encryption-key-for-testing-only';

const CIPHERTEXT_PATTERN = /^[0-9a-f]{32}:(?:[0-9a-f]{2})+:[0-9a-f]{32}$/i;

describe('CredentialCryptoService', () => {
  let service: CredentialCryptoService;

  beforeEach(() => {
    const config = { tokenEncryptionKey: KEY } as unknown as ConfigService;
    service = new CredentialCryptoService(config);
  });

  describe('encrypt / decrypt round-trip', () => {
    it('encrypts to the iv:ciphertext:authTag envelope and decrypts back', () => {
      const plaintext = 'super-secret-oauth-token';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toMatch(CIPHERTEXT_PATTERN);
      expect(service.decrypt(encrypted)).toBe(plaintext);
    });

    it('produces a fresh IV per call (no deterministic ciphertext)', () => {
      const a = service.encrypt('same-value');
      const b = service.encrypt('same-value');

      expect(a).not.toBe(b);
      expect(service.decrypt(a)).toBe('same-value');
      expect(service.decrypt(b)).toBe('same-value');
    });

    it('passes empty values through unchanged', () => {
      expect(service.encrypt('')).toBe('');
      expect(service.decrypt('')).toBe('');
    });
  });

  describe('graceful handling of plaintext (migration)', () => {
    it('decrypt returns legacy plaintext unchanged', () => {
      expect(service.decrypt('legacy-plaintext-token')).toBe(
        'legacy-plaintext-token',
      );
    });

    it('isEncrypted distinguishes ciphertext from plaintext', () => {
      expect(service.isEncrypted('plain-token')).toBe(false);
      expect(service.isEncrypted('not:enough')).toBe(false);
      expect(service.isEncrypted(service.encrypt('x'))).toBe(true);
    });
  });

  describe('idempotency', () => {
    it('does not re-encrypt an already-encrypted value', () => {
      const once = service.encrypt('token');
      const twice = service.encrypt(once);

      expect(twice).toBe(once);
      expect(service.decrypt(twice)).toBe('token');
    });
  });

  describe('encryptSecretFields', () => {
    it('encrypts every secret field and leaves everything else untouched', () => {
      const input = {
        accessToken: 'at',
        accessTokenSecret: 'ats',
        oauthToken: 'ot',
        oauthTokenSecret: 'ots',
        refreshToken: 'rt',
        // Non-secret fields that must NOT be encrypted:
        oauthState: 'state-lookup-key',
        platform: 'twitter',
        isConnected: true,
        accessTokenExpiry: new Date(0),
      };

      const result = service.encryptSecretFields(input);

      for (const field of CREDENTIAL_SECRET_FIELDS) {
        expect(result[field]).toMatch(CIPHERTEXT_PATTERN);
        expect(service.decrypt(result[field] as string)).toBe(
          input[field as keyof typeof input],
        );
      }

      // oauthState is a lookup key — encrypting it would break OAuth callbacks.
      expect(result.oauthState).toBe('state-lookup-key');
      expect(result.platform).toBe('twitter');
      expect(result.isConnected).toBe(true);
      expect(result.accessTokenExpiry).toBe(input.accessTokenExpiry);
    });

    it('returns a copy and leaves non-string / missing fields alone', () => {
      const input = { accessToken: 'at', refreshToken: undefined };
      const result = service.encryptSecretFields(input);

      expect(result).not.toBe(input);
      expect(result.accessToken).toMatch(CIPHERTEXT_PATTERN);
      expect(result.refreshToken).toBeUndefined();
    });
  });

  describe('decryption failure (wrong key / tampering)', () => {
    it('throws when an encrypted value fails GCM authentication', () => {
      const encrypted = service.encrypt('real-secret');

      // A service with a different key cannot authenticate the ciphertext.
      const wrongKeyService = new CredentialCryptoService({
        tokenEncryptionKey: 'a-totally-different-key-0123456789',
      } as unknown as ConfigService);

      // Must throw — never silently return ciphertext (wrong key / tampering).
      expect(() => wrongKeyService.decrypt(encrypted)).toThrow();
    });

    it('returns legacy plaintext unchanged (migration support)', () => {
      // A value that does NOT match the ciphertext envelope is legacy plaintext.
      expect(service.decrypt('legacy-plaintext-token')).toBe(
        'legacy-plaintext-token',
      );
    });
  });

  describe('interop with EncryptionUtil', () => {
    it('values it encrypts decrypt via the legacy EncryptionUtil (same key/format)', () => {
      const encrypted = service.encrypt('cross-decrypt-me');
      expect(EncryptionUtil.decrypt(encrypted)).toBe('cross-decrypt-me');
    });

    it('decrypts values produced by the legacy EncryptionUtil', () => {
      const encrypted = EncryptionUtil.encrypt('legacy-encrypted');
      expect(service.decrypt(encrypted)).toBe('legacy-encrypted');
    });
  });
});
