export function requireVideoOutputPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Video processing result missing outputPath');
  }

  return value;
}
