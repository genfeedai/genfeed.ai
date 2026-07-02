import { ConfigService } from '@api/config/config.service';
import {
  decryptWithKey,
  deriveEncryptionKey,
  encryptWithKey,
  isEncryptedValue,
} from '@libs/crypto/credential-cipher';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

/**
 * Credential columns that hold secrets and must be encrypted at rest.
 *
 * `oauthState` is intentionally excluded: it is a transient OAuth-callback
 * lookup key matched verbatim in `findOne({ oauthState })`, so encrypting it
 * would break state validation. `oauthTokenHash` is a hash (lookup key) and
 * the `*Expiry` columns are timestamps — neither are secrets.
 */
export const CREDENTIAL_SECRET_FIELDS = [
  'accessToken',
  'accessTokenSecret',
  'oauthToken',
  'oauthTokenSecret',
  'refreshToken',
] as const;

export type CredentialSecretField = (typeof CREDENTIAL_SECRET_FIELDS)[number];

/**
 * Encrypts and decrypts Credential secrets at rest.
 *
 * Cipher, key derivation, and envelope live in the shared
 * `@libs/crypto/credential-cipher` core — the single implementation used by
 * this service and the static `EncryptionUtil` facade, so values written by
 * either path decrypt with either path.
 *
 * The key is sourced via {@link ConfigService} (never `process.env`), satisfying
 * the project rule against direct env access in services.
 */
@Injectable()
export class CredentialCryptoService {
  private cachedKey: Buffer | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly logger?: LoggerService,
  ) {}

  private get key(): Buffer {
    if (!this.cachedKey) {
      this.cachedKey = deriveEncryptionKey(
        this.configService.tokenEncryptionKey,
      );
    }
    return this.cachedKey;
  }

  /**
   * True when `value` is already in our ciphertext envelope. Used as an
   * idempotency guard so encrypting an already-encrypted value is a no-op
   * (prevents double-encryption when a caller pre-encrypts during migration).
   */
  isEncrypted(value: string): boolean {
    return isEncryptedValue(value);
  }

  /**
   * Encrypt a plaintext secret. Empty/undefined and already-encrypted values
   * pass through unchanged.
   */
  encrypt(value: string): string {
    if (!value || this.isEncrypted(value)) {
      return value;
    }
    return encryptWithKey(this.key, value);
  }

  /**
   * Decrypt a secret.
   *
   * - Values that do NOT match a ciphertext envelope are treated as legacy
   *   plaintext and returned as-is (migration support).
   * - Values in the GCM envelope that fail authenticated decryption (wrong
   *   key, tampered ciphertext) throw immediately so the caller is never
   *   silently handed back raw ciphertext.
   */
  decrypt(value: string): string {
    if (!value) {
      return value;
    }
    return decryptWithKey(this.key, value);
  }

  /**
   * Return a shallow copy of `data` with every present credential secret field
   * encrypted. Non-string / null / undefined values are left untouched.
   */
  encryptSecretFields<T extends Record<string, unknown>>(data: T): T {
    const result: Record<string, unknown> = { ...data };

    for (const field of CREDENTIAL_SECRET_FIELDS) {
      const value = result[field];
      if (typeof value === 'string' && value.length > 0) {
        result[field] = this.encrypt(value);
      }
    }

    return result as T;
  }
}
