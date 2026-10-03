/**
 * `generate` is the single media-generation tool on every surface. Its `type`
 * parameter picks the asset kind, so routing, credit floors, review cards and
 * terminal results key off the (name, type) pair instead of per-kind names.
 */
export const MEDIA_GENERATION_TOOL_NAME = 'generate';

export const MEDIA_GENERATION_TYPES = [
  'image',
  'video',
  'voice',
  'music',
] as const;

export type MediaGenerationType = (typeof MEDIA_GENERATION_TYPES)[number];

export type VisualMediaGenerationType = Extract<
  MediaGenerationType,
  'image' | 'video'
>;

/**
 * Minimum charge per call by type (issue #482). The generation endpoint bills
 * the real amount; these floors gate affordability before the call.
 */
export const MEDIA_GENERATION_CREDIT_FLOORS: Readonly<
  Record<MediaGenerationType, number>
> = {
  image: 50,
  music: 10,
  video: 300,
  voice: 17,
};

const SHARED_PARAMETERS = ['type', 'prompt', 'model', 'brandId'] as const;

const VISUAL_PARAMETERS = [
  'aspectRatio',
  'characterHandles',
  'harness',
  'references',
  'requestedSkillSlugs',
  'resolution',
  'selectedContext',
] as const;

/**
 * Parameters each type accepts. The `generate` schema is one flat object so
 * every client can read it; this table is what makes a video-only field on
 * an image call an error instead of a silent no-op.
 */
export const MEDIA_GENERATION_TYPE_PARAMETERS: Readonly<
  Record<MediaGenerationType, ReadonlySet<string>>
> = {
  image: new Set([...SHARED_PARAMETERS, ...VISUAL_PARAMETERS, 'outputs']),
  music: new Set([...SHARED_PARAMETERS, 'duration']),
  video: new Set([
    ...SHARED_PARAMETERS,
    ...VISUAL_PARAMETERS,
    'audioUrl',
    'duration',
    'endFrame',
    'imageUrl',
    'videoReferences',
  ]),
  voice: new Set([...SHARED_PARAMETERS, 'voiceId']),
};

/** Supplied parameters (non-null) that the given type does not accept. */
export function findInapplicableMediaGenerationParameters(
  type: MediaGenerationType,
  parameters: Record<string, unknown>,
): string[] {
  const accepted = MEDIA_GENERATION_TYPE_PARAMETERS[type];
  return Object.keys(parameters)
    .filter((key) => parameters[key] !== undefined && parameters[key] !== null)
    .filter((key) => !accepted.has(key))
    .sort();
}

const MEDIA_GENERATION_TYPE_SET: ReadonlySet<string> = new Set(
  MEDIA_GENERATION_TYPES,
);

export function isMediaGenerationType(
  value: unknown,
): value is MediaGenerationType {
  return typeof value === 'string' && MEDIA_GENERATION_TYPE_SET.has(value);
}

/** The requested type of a `generate` call; `undefined` for any other tool. */
export function getMediaGenerationType(
  toolName: string,
  parameters: unknown,
): MediaGenerationType | undefined {
  if (toolName !== MEDIA_GENERATION_TOOL_NAME) return undefined;
  if (parameters === null || typeof parameters !== 'object') return undefined;
  const type = (parameters as Record<string, unknown>).type;
  return isMediaGenerationType(type) ? type : undefined;
}

export function getVisualMediaGenerationType(
  toolName: string,
  parameters: unknown,
): VisualMediaGenerationType | undefined {
  const type = getMediaGenerationType(toolName, parameters);
  return type === 'image' || type === 'video' ? type : undefined;
}

/**
 * Credit floor for one call. A `generate` call without a valid type uses the
 * highest floor so an unvalidated call can never pass a cheaper gate.
 */
export function getMediaGenerationCreditFloor(parameters: unknown): number {
  const type = getMediaGenerationType(MEDIA_GENERATION_TOOL_NAME, parameters);
  return type
    ? MEDIA_GENERATION_CREDIT_FLOORS[type]
    : Math.max(...Object.values(MEDIA_GENERATION_CREDIT_FLOORS));
}
