type SerializableDocument = Record<string, unknown> & {
  toObject?: () => unknown;
};

/**
 * Unwraps Prisma/Mongoose-shaped documents to a plain record.
 * Used by content-intelligence serializers that flatten a JSON `data` column.
 */
export function toSerializableDocument(data: unknown): SerializableDocument {
  if (!data || typeof data !== 'object') {
    return {};
  }

  if (
    'toObject' in data &&
    typeof (data as SerializableDocument).toObject === 'function'
  ) {
    const objectValue = (data as SerializableDocument).toObject?.();
    return objectValue && typeof objectValue === 'object'
      ? (objectValue as SerializableDocument)
      : {};
  }

  return data as SerializableDocument;
}

export function readJsonRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function toIdString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  if (typeof value === 'object' && typeof value.toString === 'function') {
    return value.toString();
  }

  return undefined;
}
