import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { ConfigService } from '@api/config/config.service';
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

const GCM_ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 16;
const IV_HEX_LENGTH = IV_BYTES * 2;
const AUTH_TAG_HEX_LENGTH = 32; // 16-byte GCM tag

/**
 * Matches our on-disk ciphertext envelope: `ivHex:ciphertextHex:authTagHex`,
 * with a 16-byte IV, even-length ciphertext, and a 16-byte auth tag. The strict
 * lengths make a plaintext token a near-impossible false positive, so the guard
 * can safely treat a match as "already encrypted" and skip re-encryption.
 */
const CIPHERTEXT_PATTERN = new RegExp(
  `^[0-9a-f]{${IV_HEX_LENGTH}}:(?:[0-9a-f]{2})+:[0-9a-f]{${AUTH_TAG_HEX_LENGTH}}$`,
  'i',
);

/**
 * Encrypts and decrypts Credential secrets at rest.
 *
 * The cipher (`aes-256-gcm`), key derivation (`sha256(TOKEN_ENCRYPTION_KEY)`)
 * and envelope format (`iv:ciphertext:authTag` hex) are byte-for-byte
 * compatible with the legacy `EncryptionUtil`, so values written by either path
 * decrypt with either path and no data migration is required for interop.
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
      this.cachedKey = createHash('sha256')
        .update(this.configService.tokenEncryptionKey)
        .digest();
    }
    return this.cachedKey;
  }

  /**
   * True when `value` is already in our ciphertext envelope. Used as an
   * idempotency guard so encrypting an already-encrypted value is a no-op
   * (prevents double-encryption when a caller pre-encrypts during migration).
   */
  isEncrypted(value: string): boolean {
    return CIPHERTEXT_PATTERN.test(value);
  }

  /**
   * Encrypt a plaintext secret. Empty/undefined and already-encrypted values
   * pass through unchanged.
   */
  encrypt(value: string): string {
    if (!value || this.isEncrypted(value)) {
      return value;
    }

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(GCM_ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
  }

  /**
   * Decrypt a secret.
   *
   * - Values that do NOT match the ciphertext envelope pattern are treated as
   *   legacy plaintext and returned as-is (migration support).
   * - Values that DO match the envelope pattern but fail GCM authenticated
   *   decryption (wrong key, tampered ciphertext) throw immediately so the
   *   caller is never silently handed back raw ciphertext.
   */
  decrypt(value: string): string {
    if (!value || !this.isEncrypted(value)) {
      // Not in ciphertext format — legacy plaintext, return as-is.
      return value;
    }

    const parts = value.split(':');
    const [ivHex, encryptedHex, authTagHex] = parts;

    const decipher = createDecipheriv(
      GCM_ALGORITHM,
      this.key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    // Let GCM auth errors throw — returning ciphertext on failure would silently
    // ship an encrypted blob to the upstream API (wrong key / tampered value).
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
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
