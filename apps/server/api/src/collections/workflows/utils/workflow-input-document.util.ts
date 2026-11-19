function dropUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => dropUndefined(item));
  }
  if (value === null || typeof value !== 'object' || value instanceof Date) {
    return value;
  }
  return toWorkflowInputDocument(value);
}

/** Remove undefined fields that Nest leaves on validated DTOs before the JSON workflow contract runs. */
export function toWorkflowInputDocument(
  value: object,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, dropUndefined(entry)]),
  );
}
