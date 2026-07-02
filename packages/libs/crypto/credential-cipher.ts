import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const GCM_ALGORITHM = 'aes-256-gcm';
const LEGACY_CBC_ALGORITHM = 'aes-256-cbc';
const IV_BYTES = 16;
const IV_HEX_LENGTH = IV_BYTES * 2;
const AUTH_TAG_HEX_LENGTH = 32; // 16-byte GCM tag

/**
 * Matches the canonical on-disk ciphertext envelope:
 * `ivHex:ciphertextHex:authTagHex` with a 16-byte IV, even-length ciphertext,
 * and a 16-byte GCM auth tag. The strict lengths make a plaintext token a
 * near-impossible false positive, so a match can safely be treated as
 * "already encrypted".
 */
export const CIPHERTEXT_PATTERN = new RegExp(
  `^[0-9a-f]{${IV_HEX_LENGTH}}:(?:[0-9a-f]{2})+:[0-9a-f]{${AUTH_TAG_HEX_LENGTH}}$`,
  'i',
);

/**
 * Matches the legacy AES-256-CBC envelope (`ivHex:ciphertextHex`, no auth tag)
 * written by the retired `CryptoService`. Only integration bot tokens were
 * ever stored in this format; it is read-only — new writes always use GCM.
 */
const LEGACY_CBC_PATTERN = new RegExp(
  `^[0-9a-f]{${IV_HEX_LENGTH}}:(?:[0-9a-f]{2})+$`,
  'i',
);

/** Derive the 32-byte AES key from the shared secret (sha256, historical). */
export function deriveEncryptionKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/**
 * Config-layer accessor for the shared encryption secret (same boundary as
 * `@libs/config`'s lightweight config services). Throws when unset so
 * encryption can never silently fall back to persisting plaintext —
 * mirroring `ConfigService.tokenEncryptionKey`, which DI consumers should
 * prefer.
 */
export function resolveTokenEncryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is required to encrypt credential secrets but is not set',
    );
  }
  return key;
}

/** True when `value` is in the canonical GCM ciphertext envelope. */
export function isEncryptedValue(value: string): boolean {
  return CIPHERTEXT_PATTERN.test(value);
}

/**
 * Encrypt a plaintext secret into the canonical GCM envelope.
 * Empty values pass through unchanged.
 */
export function encryptWithKey(key: Buffer, value: string): string {
  if (!value) {
    return value;
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(GCM_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

/**
 * Decrypt a stored secret.
 *
 * - Canonical GCM envelope: authenticated decryption; wrong key or tampered
 *   ciphertext THROWS so callers are never silently handed back ciphertext.
 * - Legacy CBC envelope (integration bot tokens written before the GCM
 *   migration): best-effort decrypt; on failure the value is returned as-is,
 *   preserving the retired CryptoService's lenient behavior for old rows.
 * - Anything else is treated as legacy plaintext and returned unchanged.
 */
export function decryptWithKey(key: Buffer, value: string): string {
  if (!value) {
    return value;
  }

  if (CIPHERTEXT_PATTERN.test(value)) {
    const [ivHex, encryptedHex, authTagHex] = value.split(':');
    const decipher = createDecipheriv(
      GCM_ALGORITHM,
      key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  if (LEGACY_CBC_PATTERN.test(value)) {
    try {
      const [ivHex, encryptedHex] = value.split(':');
      const decipher = createDecipheriv(
        LEGACY_CBC_ALGORITHM,
        key,
        Buffer.from(ivHex, 'hex'),
      );
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedHex, 'hex')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      return value;
    }
  }

  return value;
}
