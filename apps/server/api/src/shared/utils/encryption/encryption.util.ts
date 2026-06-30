import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import process from 'node:process';

/**
 * Matches our on-disk ciphertext envelope: `ivHex:ciphertextHex:authTagHex`
 * with a 16-byte IV (32 hex chars), even-length ciphertext (2+ hex chars),
 * and a 16-byte GCM auth tag (32 hex chars).
 *
 * A value that does NOT match this pattern is treated as legacy plaintext and
 * returned unchanged. A value that DOES match but fails GCM auth throws so
 * the caller is never silently handed back raw ciphertext.
 */
const CIPHERTEXT_PATTERN = /^[0-9a-f]{32}:(?:[0-9a-f]{2})+:[0-9a-f]{32}$/i;

/**
 * Utility for encrypting and decrypting sensitive strings.
 * Uses lazy initialization to allow ConfigService to load env vars first.
 */
export class EncryptionUtil {
  private static readonly gcmAlgorithm = 'aes-256-gcm';
  private static _key: Buffer | null = null;
  private static _keySource: string | null = null;

  private static get key(): Buffer {
    const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error(
        'TOKEN_ENCRYPTION_KEY environment variable is required for encryption operations',
      );
    }
    // Re-derive if the secret has changed (e.g. key rotation) or was never set.
    // Never cache a key derived from an empty/missing secret.
    if (!EncryptionUtil._key || EncryptionUtil._keySource !== encryptionKey) {
      EncryptionUtil._key = createHash('sha256').update(encryptionKey).digest();
      EncryptionUtil._keySource = encryptionKey;
    }
    return EncryptionUtil._key;
  }

  static encrypt(value: string): string {
    if (!value) {
      return value;
    }

    const iv = randomBytes(16);
    const cipher = createCipheriv(
      EncryptionUtil.gcmAlgorithm,
      EncryptionUtil.key,
      iv,
    );

    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
  }

  static decrypt(value: string): string {
    if (!value) {
      return value;
    }

    if (!CIPHERTEXT_PATTERN.test(value)) {
      // Does not match the ciphertext envelope — treat as legacy plaintext.
      return value;
    }

    // Value matches the envelope pattern: attempt GCM decryption and let any
    // authentication failure throw (wrong key or tampered ciphertext).
    const parts = value.split(':');
    return EncryptionUtil.decryptGcm(parts[0], parts[1], parts[2]);
  }

  private static decryptGcm(
    ivHex?: string,
    encryptedHex?: string,
    authTagHex?: string,
  ): string {
    if (!ivHex || !encryptedHex || !authTagHex) {
      throw new Error('Invalid GCM encrypted payload');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv(
      EncryptionUtil.gcmAlgorithm,
      EncryptionUtil.key,
      iv,
    );
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encryptedText),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
