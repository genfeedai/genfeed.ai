import { createHash } from 'node:crypto';

export class HashUtil {
  /**
   * Generate SHA-256 hash for deterministic lookups
   * @param value - Plain text value to hash
   * @returns Hex string of SHA-256 hash
   */
  static hash(value: string): string {
    if (!value) {
      return value;
    }
    return createHash('sha256').update(value).digest('hex');
  }
}
