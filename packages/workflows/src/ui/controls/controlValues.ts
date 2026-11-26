/** A select hands back text; fields that store a number turn it back. */
export function coerceControlValue(fieldId: string, value: unknown): unknown {
  return fieldId === 'duration' ? Number(value) : value;
}
