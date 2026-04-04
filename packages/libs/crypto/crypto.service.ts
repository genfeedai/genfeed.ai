import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CryptoService {
  private static readonly algorithm = 'aes-256-cbc';
  private keyCache: Buffer | null = null;

  private get key(): Buffer {
    if (!this.keyCache) {
      const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new Error(
          'TOKEN_ENCRYPTION_KEY environment variable is required for encryption operations',
        );
      }
      this.keyCache = createHash('sha256').update(encryptionKey).digest();
    }
    return this.keyCache;
  }

  encrypt(value: string): string {
    if (!value) {
      return value;
    }
    const iv = randomBytes(16);
    const cipher = createCipheriv(CryptoService.algorithm, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(value: string): string {
    if (!value) {
      return value;
    }
    try {
      const [ivHex, encryptedHex] = value.split(':');
      if (!ivHex || !encryptedHex) {
        return value;
      }
      const iv = Buffer.from(ivHex, 'hex');
      const encryptedText = Buffer.from(encryptedHex, 'hex');
      const decipher = createDecipheriv(CryptoService.algorithm, this.key, iv);
      const decrypted = Buffer.concat([
        decipher.update(encryptedText),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      return value;
    }
  }
}
