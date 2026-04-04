import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * Utility for encrypting and decrypting sensitive strings.
 * Uses lazy initialization to allow ConfigService to load env vars first.
 */
export class EncryptionUtil {
  private static readonly gcmAlgorithm = 'aes-256-gcm';
  private static _key: Buffer | null = null;

  private static get key(): Buffer {
    if (!EncryptionUtil._key) {
      const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new Error(
          'TOKEN_ENCRYPTION_KEY environment variable is required for encryption operations',
        );
      }
      EncryptionUtil._key = createHash('sha256').update(encryptionKey).digest();
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

    try {
      const parts = value.split(':');

      if (parts.length === 3) {
        return EncryptionUtil.decryptGcm(parts[0], parts[1], parts[2]);
      }

      return value;
    } catch {
      return value;
    }
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
