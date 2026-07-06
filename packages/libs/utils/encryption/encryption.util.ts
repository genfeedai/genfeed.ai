import {
  decryptWithKey,
  deriveEncryptionKey,
  encryptWithKey,
  resolveTokenEncryptionKey,
} from '@libs/crypto/credential-cipher';

/**
 * Static facade over the shared credential cipher for non-DI call sites
 * (utils, workers processors, scripts).
 *
 * The key is sourced through the shared config-layer accessor and lazily
 * initialized so env loading in `bootstrap()` completes first. DI consumers
 * should prefer `CredentialCryptoService`, which sources the key via
 * `ConfigService` and adds the idempotency guard and credential-field helpers
 * on the same cipher.
 */
export class EncryptionUtil {
  private static _key: Buffer | null = null;
  private static _keySource: string | null = null;

  private static get key(): Buffer {
    const encryptionKey = resolveTokenEncryptionKey();

    // Re-derive if the secret has changed (e.g. key rotation) or was never set.
    // Never cache a key derived from an empty/missing secret.
    if (!EncryptionUtil._key || EncryptionUtil._keySource !== encryptionKey) {
      EncryptionUtil._key = deriveEncryptionKey(encryptionKey);
      EncryptionUtil._keySource = encryptionKey;
    }
    return EncryptionUtil._key;
  }

  static encrypt(value: string): string {
    if (!value) {
      return value;
    }
    return encryptWithKey(EncryptionUtil.key, value);
  }

  static decrypt(value: string): string {
    if (!value) {
      return value;
    }
    return decryptWithKey(EncryptionUtil.key, value);
  }
}
