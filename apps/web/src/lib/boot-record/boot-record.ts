import type { BootRecord } from '@/props/layout/boot-record.props';

export const BOOT_RECORD_STORAGE_KEY = 'genfeed:boot:v1';

/** The same window as the device query cache; a longer one needs a decision. */
export const BOOT_RECORD_MAX_AGE_MS = 30 * 60_000;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** The stored text, or null. A string is a stable snapshot for React. */
export function readBootRecordText(): string | null {
  try {
    return window.localStorage.getItem(BOOT_RECORD_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function subscribeToBootRecord(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === BOOT_RECORD_STORAGE_KEY || event.key === null) {
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

/**
 * The record, if the text holds one that is still valid for this build and
 * inside the age limit. Anything else is "no record": a record never has to be
 * repaired.
 */
export function parseBootRecord(
  text: string | null,
  options: { buildId: string; now: number },
): BootRecord | null {
  if (!text) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    const record = value as Partial<BootRecord>;
    const rail = record.rail;
    if (
      record.buildId !== options.buildId ||
      typeof record.organizationSlug !== 'string' ||
      typeof record.userId !== 'string' ||
      typeof record.savedAt !== 'number' ||
      options.now - record.savedAt > BOOT_RECORD_MAX_AGE_MS ||
      typeof rail !== 'object' ||
      rail === null ||
      !isStringArray(rail.hiddenAppIds) ||
      !isStringArray(rail.pinnedAppIds) ||
      !isStringArray(rail.railAppOrder) ||
      typeof rail.flags !== 'object' ||
      rail.flags === null
    ) {
      return null;
    }
    return record as BootRecord;
  } catch {
    return null;
  }
}

/** Whose record is stored, whatever its age or build; null when none is. */
export function readBootRecordUserId(): string | null {
  try {
    const value: unknown = JSON.parse(readBootRecordText() ?? 'null');
    if (typeof value === 'object' && value !== null && 'userId' in value) {
      return typeof value.userId === 'string' ? value.userId : null;
    }
  } catch {
    // Unreadable text is no record.
  }
  return null;
}

export function writeBootRecord(record: BootRecord): void {
  try {
    window.localStorage.setItem(
      BOOT_RECORD_STORAGE_KEY,
      JSON.stringify(record),
    );
  } catch {
    // Storage can be full or blocked; the next load simply has no record.
    return;
  }
  notify();
}

export function clearBootRecord(): void {
  try {
    window.localStorage.removeItem(BOOT_RECORD_STORAGE_KEY);
  } catch {
    return;
  }
  notify();
}
