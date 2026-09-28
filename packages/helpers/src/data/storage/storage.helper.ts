// Storage is a preference cache, never a source of truth: a browser policy
// that blocks it, or a full quota, must leave callers on their in-memory state.
export function readLocalStorageItem(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalStorageItem(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Blocked or full storage keeps the caller's in-memory value.
  }
}

export function readLocalStorageStringArray(key: string): string[] {
  try {
    const stored = readLocalStorageItem(key);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

export function writeLocalStorageStringArray(
  key: string,
  values: string[],
): void {
  try {
    writeLocalStorageItem(key, JSON.stringify(values));
  } catch {
    // Storage can be unavailable or full; callers retain their in-memory state.
  }
}
