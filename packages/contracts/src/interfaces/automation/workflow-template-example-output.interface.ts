import { MediaType } from '../../enums/media-type.enum';

/**
 * Example output a workflow template produces, shown as its catalog preview
 * on the templates page (#5498). System templates are global, so this always
 * points at a public hosted asset, never tenant media.
 */
export interface WorkflowTemplateExampleOutput {
  mediaType: MediaType;
  /** Still frame shown before playback, or instead of it for reduced motion. */
  posterUrl?: string;
  url: string;
}

const EXAMPLE_OUTPUT_URL_PROTOCOLS: ReadonlySet<string> = new Set([
  'http:',
  'https:',
]);

const EXAMPLE_OUTPUT_MEDIA_TYPES: ReadonlySet<string> = new Set(
  Object.values(MediaType),
);

function isExampleOutputMediaType(value: unknown): value is MediaType {
  return typeof value === 'string' && EXAMPLE_OUTPUT_MEDIA_TYPES.has(value);
}

/** Absolute http(s) URL only; `javascript:`, `data:` and relative paths fail. */
export function isWorkflowTemplateExampleOutputUrl(
  value: unknown,
): value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }
  try {
    return EXAMPLE_OUTPUT_URL_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Reads an example output from an untyped payload. Anything malformed reads
 * as no example output, so the catalog falls back to the workflow graph; a
 * malformed poster is dropped and the video keeps its own first frame.
 */
export function parseWorkflowTemplateExampleOutput(
  value: unknown,
): WorkflowTemplateExampleOutput | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (
    !isExampleOutputMediaType(record.mediaType) ||
    !isWorkflowTemplateExampleOutputUrl(record.url)
  ) {
    return undefined;
  }

  return {
    mediaType: record.mediaType,
    ...(isWorkflowTemplateExampleOutputUrl(record.posterUrl)
      ? { posterUrl: record.posterUrl }
      : {}),
    url: record.url,
  };
}
