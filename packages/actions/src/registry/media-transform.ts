/**
 * `transform_media` is the single tool that changes an existing media asset or
 * joins several. Its `operation` parameter picks the transform, so the schema
 * stays one flat object while the runtime rejects fields that belong to a
 * different operation.
 */
export const MEDIA_TRANSFORM_TOOL_NAME = 'transform_media';

export const MEDIA_TRANSFORM_OPERATIONS = [
  'edit',
  'reframe',
  'upscale',
  'merge',
] as const;

export type MediaTransformOperation =
  (typeof MEDIA_TRANSFORM_OPERATIONS)[number];

/** Result card kind per operation: edits, reframes and upscales yield images. */
export const MEDIA_TRANSFORM_RESULT_KINDS: Readonly<
  Record<MediaTransformOperation, 'image' | 'video'>
> = {
  edit: 'image',
  merge: 'video',
  reframe: 'image',
  upscale: 'image',
};

/** Aspect ratios the reframe operation accepts. */
export const MEDIA_REFRAME_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
] as const;

/** Same message the video merge API returns when zoom is supplied. */
export const MEDIA_MERGE_ZOOM_UNSUPPORTED =
  'Zoom effects are not supported when merging videos';

/** Same message the video merge API returns when an ease curve is supplied. */
export const MEDIA_MERGE_TRANSITION_EASE_UNSUPPORTED =
  'Transition ease curves are not supported when merging videos';

const SHARED_PARAMETERS = ['operation', 'brandId'] as const;

/**
 * Parameters each operation accepts. The `transform_media` schema is one flat
 * object so every client can read it; this table is what makes a merge-only
 * field on an edit call an error instead of a silent no-op.
 */
export const MEDIA_TRANSFORM_OPERATION_PARAMETERS: Readonly<
  Record<MediaTransformOperation, ReadonlySet<string>>
> = {
  edit: new Set([
    ...SHARED_PARAMETERS,
    'aspectRatio',
    'imageId',
    'maskId',
    'model',
    'outputs',
    'prompt',
    'references',
    'resolution',
    'seed',
    'size',
  ]),
  merge: new Set([
    ...SHARED_PARAMETERS,
    'ids',
    'isCaptionsEnabled',
    'isMuteVideoAudio',
    'isResizeEnabled',
    'music',
    'musicVolume',
    'transition',
    'transitionDuration',
  ]),
  reframe: new Set([...SHARED_PARAMETERS, 'aspectRatio', 'imageId']),
  upscale: new Set([...SHARED_PARAMETERS, 'imageUrl']),
};

/** Supplied parameters (non-null) that the given operation does not accept. */
export function findInapplicableMediaTransformParameters(
  operation: MediaTransformOperation,
  parameters: Record<string, unknown>,
): string[] {
  const accepted = MEDIA_TRANSFORM_OPERATION_PARAMETERS[operation];
  return Object.keys(parameters)
    .filter((key) => parameters[key] !== undefined && parameters[key] !== null)
    .filter((key) => !accepted.has(key))
    .sort();
}

const MEDIA_TRANSFORM_OPERATION_SET: ReadonlySet<string> = new Set(
  MEDIA_TRANSFORM_OPERATIONS,
);

export function isMediaTransformOperation(
  value: unknown,
): value is MediaTransformOperation {
  return typeof value === 'string' && MEDIA_TRANSFORM_OPERATION_SET.has(value);
}

/** The requested operation of a `transform_media` call; `undefined` for any other tool. */
export function getMediaTransformOperation(
  toolName: string,
  parameters: unknown,
): MediaTransformOperation | undefined {
  if (toolName !== MEDIA_TRANSFORM_TOOL_NAME) return undefined;
  if (parameters === null || typeof parameters !== 'object') return undefined;
  const operation = (parameters as Record<string, unknown>).operation;
  return isMediaTransformOperation(operation) ? operation : undefined;
}
