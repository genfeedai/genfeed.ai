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
  'digital_twin',
  'digital_twin_consent',
] as const;

export type MediaTransformOperation =
  (typeof MEDIA_TRANSFORM_OPERATIONS)[number];

/**
 * Operations that turn the person's own Library recording into a digital
 * twin in their connected HeyGen account (#9688). They render no media here
 * and charge no Genfeed credits; HeyGen bills the account that owns the twin.
 */
export const DIGITAL_TWIN_TRANSFORM_OPERATIONS = [
  'digital_twin',
  'digital_twin_consent',
] as const satisfies readonly MediaTransformOperation[];

export type DigitalTwinTransformOperation =
  (typeof DIGITAL_TWIN_TRANSFORM_OPERATIONS)[number];

export type MediaOutputTransformOperation = Exclude<
  MediaTransformOperation,
  DigitalTwinTransformOperation
>;

/** Result card kind per operation: edits, reframes and upscales yield images. */
export const MEDIA_TRANSFORM_RESULT_KINDS: Readonly<
  Record<MediaOutputTransformOperation, 'image' | 'video'>
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
    'beatSyncCutStrategy',
    'ids',
    'isBeatSyncEnabled',
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
  digital_twin: new Set([
    ...SHARED_PARAMETERS,
    'isRecordingKept',
    'name',
    'videoId',
  ]),
  digital_twin_consent: new Set([...SHARED_PARAMETERS, 'twinId']),
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

const DIGITAL_TWIN_TRANSFORM_OPERATION_SET: ReadonlySet<string> = new Set(
  DIGITAL_TWIN_TRANSFORM_OPERATIONS,
);

export function isDigitalTwinTransformOperation(
  value: unknown,
): value is DigitalTwinTransformOperation {
  return (
    typeof value === 'string' && DIGITAL_TWIN_TRANSFORM_OPERATION_SET.has(value)
  );
}

/**
 * Operations that never charge Genfeed credits and need no brand: merge runs
 * on the local files queue, and a digital twin lives in the organization's own
 * HeyGen account, not in a brand.
 */
export function isFreeMediaTransformOperation(
  operation: MediaTransformOperation | undefined,
): boolean {
  return operation === 'merge' || isDigitalTwinTransformOperation(operation);
}

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
