interface SlugCacheEntry<T> {
  expiresAt: number;
  value: T;
}

export interface SlugCache<T> {
  read: (secret: string) => Promise<T | null>;
  /** Cache keys currently held. Tests only. */
  keys: () => string[];
  write: (secret: string, value: T) => Promise<void>;
}

interface SlugCacheOptions<T> {
  isValid: (value: T) => boolean;
  maxEntries: number;
  ttlMs: number;
}

/** Hex SHA-256 of the secret, so a session cookie is never held as a Map key. */
async function digestKey(secret: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/**
 * In-memory TTL cache keyed by a digest of a secret such as a session cookie.
 * Expired entries are dropped on write and the size is capped, oldest first
 * (a Map keeps insertion order).
 */
export function createSlugCache<T>({
  isValid,
  maxEntries,
  ttlMs,
}: SlugCacheOptions<T>): SlugCache<T> {
  const entries = new Map<string, SlugCacheEntry<T>>();

  return {
    keys: () => Array.from(entries.keys()),
    read: async (secret) => {
      const key = await digestKey(secret);
      const entry = entries.get(key);
      if (!entry) {
        return null;
      }
      if (entry.expiresAt <= Date.now() || !isValid(entry.value)) {
        entries.delete(key);
        return null;
      }
      return entry.value;
    },
    write: async (secret, value) => {
      const key = await digestKey(secret);
      const now = Date.now();
      for (const [existingKey, entry] of entries) {
        if (entry.expiresAt <= now) {
          entries.delete(existingKey);
        }
      }
      // Re-inserting moves a refreshed key to the newest position.
      entries.delete(key);
      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) {
          break;
        }
        entries.delete(oldest);
      }
      entries.set(key, { expiresAt: now + ttlMs, value });
    },
  };
}
