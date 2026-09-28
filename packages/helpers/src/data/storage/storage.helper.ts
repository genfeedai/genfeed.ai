export function readLocalStorageItem(key: string): string | null {
  return typeof window === 'undefined'
    ? null
    : window.localStorage.getItem(key);
}

export function writeLocalStorageItem(key: string, value: string): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, value);
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
