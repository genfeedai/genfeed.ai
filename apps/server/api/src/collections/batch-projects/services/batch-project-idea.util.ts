import type {
  BatchIdea,
  BatchIdeaFormat,
} from '@genfeedai/contracts/interfaces';

const IDEA_FORMATS = new Set<string>(['avatar', 'image', 'video']);

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Parse a persisted idea brief; anything malformed reads as no idea. */
export function readBatchProjectIdea(value: unknown): BatchIdea | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = readString(record.id);
  const format = readString(record.format);
  if (!id || !format || !IDEA_FORMATS.has(format)) {
    return null;
  }
  const speechText = readString(record.speechText);
  return {
    caption: readString(record.caption) ?? '',
    format: format as BatchIdeaFormat,
    hook: readString(record.hook) ?? '',
    id,
    platformHints: Array.isArray(record.platformHints)
      ? record.platformHints.filter(
          (hint): hint is string => typeof hint === 'string',
        )
      : [],
    visualPrompt: readString(record.visualPrompt) ?? '',
    ...(speechText ? { speechText } : {}),
  };
}
