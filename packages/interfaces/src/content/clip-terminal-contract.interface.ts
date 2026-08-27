export const CLIP_PROJECT_STATUSES = [
  'pending',
  'transcribing',
  'analyzing',
  'analyzed',
  'clipping',
  'captioning',
  'generating',
  'partially-completed',
  'completed',
  'failed',
] as const;

export type ClipProjectStatus = (typeof CLIP_PROJECT_STATUSES)[number];

export const CLIP_PROJECT_TERMINAL_STATUSES = [
  'partially-completed',
  'completed',
  'failed',
] as const;

export const CLIP_RESULT_STATUSES = [
  'pending',
  'extracting',
  'reframing',
  'captioning',
  'validating',
  'completed',
  'degraded',
  'failed',
] as const;

export type ClipResultStatus = (typeof CLIP_RESULT_STATUSES)[number];

export const CLIP_TERMINAL_STATUSES = [
  'completed',
  'degraded',
  'failed',
] as const;

export type ClipTerminalStatus = (typeof CLIP_TERMINAL_STATUSES)[number];

/**
 * Generation mode a clip-result was produced by.
 * - `avatar`: external avatar/voice provider regeneration (original behavior).
 * - `raw-cut`: deterministic ffmpeg cut + caption burn of the source footage.
 *
 * Canonical for the schema default, the generate DTO, and the clip-generation
 * service so the discriminator never drifts across surfaces.
 */
export const CLIP_RESULT_MODES = ['avatar', 'raw-cut'] as const;

export type ClipResultMode = (typeof CLIP_RESULT_MODES)[number];

/** Default mode for existing/avatar clip-results (matches the DB column default). */
export const DEFAULT_CLIP_RESULT_MODE: ClipResultMode = 'avatar';

export function isClipResultMode(value: unknown): value is ClipResultMode {
  return CLIP_RESULT_MODES.some((mode) => mode === value);
}

export const CLIP_READINESS_STATES = [
  'pending',
  'ready',
  'blocked',
  'failed',
] as const;

export type ClipReadinessState = (typeof CLIP_READINESS_STATES)[number];

export const CLIP_READY_ACTIONS = [
  'download',
  'edit',
  'publish',
  'retry',
] as const;

export type ClipReadyAction = (typeof CLIP_READY_ACTIONS)[number];

export interface ClipReadinessContract {
  state: ClipReadinessState;
  terminal: boolean;
  readyActions: ClipReadyAction[];
  blockingReasons: string[];
  terminalAt?: string | null;
}

export interface ClipProjectTerminalContract {
  status: ClipProjectStatus;
  progress: number;
  readiness: ClipReadinessContract;
  readyClipCount: number;
  failedClipCount: number;
  pendingClipCount: number;
  terminalAt?: Date | string | null;
  error?: string | null;
}

export interface ClipResultTerminalContract {
  status: ClipResultStatus;
  readiness: ClipReadinessContract;
  isSelected: boolean;
  terminalAt?: Date | string | null;
}

export interface ClipRawCutFramingContract {
  aspectRatio: '9:16';
  height: 1920;
  /**
   * `contain-blur` keeps the complete source frame visible over a blurred
   * portrait background. It is the deterministic safe fallback when no
   * subject-tracking decision is available.
   */
  strategy: 'contain-blur';
  subjectSafety: 'full-source-visible';
  version: 1;
  width: 1080;
}

export interface ClipRawCutMediaValidationContract {
  checkedAt: string;
  decodeOk: boolean;
  durationSeconds: number | null;
  expectedDurationSeconds: number;
  hasAudio: boolean;
  height: number | null;
  issues: string[];
  status: 'failed' | 'passed';
  videoCodec: string | null;
  width: number | null;
}

/**
 * Library-link readiness is independent of clip render readiness.
 * A clip can be terminal/ready while its canonical Ingredient is still
 * pending, linked, degraded, or failed to persist.
 */
export const CLIP_LIBRARY_LINK_STATUSES = [
  'pending',
  'linked',
  'degraded',
  'failed',
] as const;

export type ClipLibraryLinkStatus = (typeof CLIP_LIBRARY_LINK_STATUSES)[number];

export function isClipLibraryLinkStatus(
  value: unknown,
): value is ClipLibraryLinkStatus {
  return CLIP_LIBRARY_LINK_STATUSES.some((status) => status === value);
}

export const CLIP_RESULT_GENERATION_SOURCE_PREFIX = 'clip-result:';

export function clipResultGenerationSource(clipResultId: string): string {
  return `${CLIP_RESULT_GENERATION_SOURCE_PREFIX}${clipResultId}`;
}

export function parseClipResultIdFromGenerationSource(
  value: unknown,
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  if (!value.startsWith(CLIP_RESULT_GENERATION_SOURCE_PREFIX)) {
    return undefined;
  }

  const clipResultId = value.slice(CLIP_RESULT_GENERATION_SOURCE_PREFIX.length);
  return clipResultId.length > 0 ? clipResultId : undefined;
}
