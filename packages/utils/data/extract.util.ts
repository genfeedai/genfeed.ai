export type UnknownRecord = Record<string, unknown>;
export type PropertyPath = Array<string | number>;

export function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getNestedValue(source: unknown, path: PropertyPath): unknown {
  let cursor: unknown = source;

  for (const key of path) {
    if (Array.isArray(cursor) && typeof key === 'number') {
      cursor = cursor[key];
      continue;
    }

    if (isRecord(cursor) && typeof key === 'string') {
      cursor = cursor[key];
      continue;
    }

    return undefined;
  }

  return cursor;
}

export function extractString(
  record: UnknownRecord | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

export function extractFirstString(
  source: unknown,
  ...keys: string[]
): string | undefined {
  if (!isRecord(source)) {
    return undefined;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  }

  return undefined;
}

export function extractStringArray(
  source: unknown,
  ...keys: string[]
): string[] {
  if (!isRecord(source)) {
    return [];
  }

  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is string => typeof item === 'string' && item !== '',
      );
    }
  }

  return [];
}

export function extractBoolean(source: unknown, key: string): boolean {
  return isRecord(source) && source[key] === true;
}

export function getStringByPaths(
  source: unknown,
  paths: PropertyPath[],
): string | null {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

export function getNumberByPaths(
  source: unknown,
  paths: PropertyPath[],
): number | null {
  for (const path of paths) {
    const value = getNestedValue(source, path);

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

export function extractHashtags(text: string): string[] {
  const matches = text.match(/#\w+/g);
  return matches ? matches.map((tag) => tag.slice(1)) : [];
}
