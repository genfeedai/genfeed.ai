export function mediaArtifactUrl(
  value: unknown,
  kind: 'audio' | 'video' | 'image',
): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const artifact = value as Record<string, unknown>;
  for (const field of [
    `${kind}Url`,
    kind,
    `output${kind[0].toUpperCase()}${kind.slice(1)}Url`,
    'url',
    'data',
  ]) {
    const candidate = artifact[field];
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
    if (candidate && typeof candidate === 'object' && candidate !== value) {
      const nested = mediaArtifactUrl(candidate, kind);
      if (nested) return nested;
    }
  }
  return undefined;
}
