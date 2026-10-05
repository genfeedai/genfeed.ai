import type {
  BatchIdea,
  BatchIdeaFormat,
} from '@genfeedai/contracts/interfaces';
import { readRawString } from '@genfeedai/utils/data/extract.util';

const IDEA_FORMATS = new Set<string>(['avatar', 'image', 'video']);

/** Parse a persisted idea brief; anything malformed reads as no idea. */
export function readBatchProjectIdea(value: unknown): BatchIdea | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = readRawString(record.id);
  const format = readRawString(record.format);
  if (!id || !format || !IDEA_FORMATS.has(format)) {
    return null;
  }
  const speechText = readRawString(record.speechText);
  return {
    caption: readRawString(record.caption) ?? '',
    format: format as BatchIdeaFormat,
    hook: readRawString(record.hook) ?? '',
    id,
    platformHints: Array.isArray(record.platformHints)
      ? record.platformHints.filter(
          (hint): hint is string => typeof hint === 'string',
        )
      : [],
    visualPrompt: readRawString(record.visualPrompt) ?? '',
    ...(speechText ? { speechText } : {}),
  };
}
