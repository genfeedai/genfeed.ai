import { safeStorage } from 'electron';

/**
 * Opt-in for hosts with no OS keychain (for example Linux without a keyring).
 * Without it Desktop refuses to store credentials, because the fallback is
 * plaintext on disk.
 */
export const ALLOW_PLAINTEXT_STORAGE_ENV =
  'GENFEED_DESKTOP_ALLOW_PLAINTEXT_STORAGE';

const SECURE_STORAGE_UNAVAILABLE_MESSAGE = `Genfeed Desktop cannot store your sign-in because this computer has no OS keychain to encrypt it. Install or unlock a keyring (for example gnome-keyring or KWallet), or set ${ALLOW_PLAINTEXT_STORAGE_ENV}=1 to store it unencrypted.`;

export class SecureStorageUnavailableError extends Error {
  constructor() {
    super(SECURE_STORAGE_UNAVAILABLE_MESSAGE);
    this.name = 'SecureStorageUnavailableError';
  }
}

function isPlaintextStorageAllowed(): boolean {
  const value = process.env[ALLOW_PLAINTEXT_STORAGE_ENV]?.trim().toLowerCase();

  return value === '1' || value === 'true';
}

/** True when credentials can be stored: an OS keychain, or the explicit opt-in. */
export function isCredentialStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable() || isPlaintextStorageAllowed();
}

export function assertCredentialStorageAvailable(): void {
  if (!isCredentialStorageAvailable()) {
    throw new SecureStorageUnavailableError();
  }
}

export function encryptCredential(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64');
  }

  assertCredentialStorageAvailable();
  return value;
}

export function decryptCredential(stored: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  }

  assertCredentialStorageAvailable();
  return stored;
}
