export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

export function asNumber(value: unknown): number | undefined;
export function asNumber(value: unknown, fallback: number): number;
export function asNumber(
  value: unknown,
  fallback?: number,
): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function asDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

export function dateToTime(
  value: Date | string | null | undefined,
): number | null {
  return asDate(value)?.getTime() ?? null;
}

export function serializeDate(value: unknown): string | null {
  return asDate(value)?.toISOString() ?? null;
}
