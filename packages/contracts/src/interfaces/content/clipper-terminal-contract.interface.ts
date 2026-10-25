export const CLIPPER_PROJECT_STATUSES = [
  'draft',
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

export type ClipperProjectStatus = (typeof CLIPPER_PROJECT_STATUSES)[number];

export const CLIPPER_PROJECT_TERMINAL_STATUSES = [
  'partially-completed',
  'completed',
  'failed',
] as const;

export const CLIPPER_RESULT_STATUSES = [
  'pending',
  'extracting',
  'reframing',
  'captioning',
  'validating',
  'completed',
  'degraded',
  'failed',
] as const;

export type ClipperResultStatus = (typeof CLIPPER_RESULT_STATUSES)[number];

export const CLIPPER_TERMINAL_STATUSES = [
  'completed',
  'degraded',
  'failed',
] as const;

export type ClipperTerminalStatus = (typeof CLIPPER_TERMINAL_STATUSES)[number];

/**
 * Generation mode a clipper-result was produced by.
 * - `avatar`: external avatar/voice provider regeneration (original behavior).
 * - `raw-cut`: deterministic ffmpeg cut + caption burn of the source footage.
 *
 * Canonical for the schema default, the generate DTO, and the clipper-generation
 * service so the discriminator never drifts across surfaces.
 */
export const CLIPPER_RESULT_MODES = ['avatar', 'raw-cut'] as const;

export type ClipperResultMode = (typeof CLIPPER_RESULT_MODES)[number];

/** Default mode for existing/avatar clipper-results (matches the DB column default). */
export const DEFAULT_CLIP_RESULT_MODE: ClipperResultMode = 'avatar';

export function isClipperResultMode(
  value: unknown,
): value is ClipperResultMode {
  return CLIPPER_RESULT_MODES.some((mode) => mode === value);
}

export const CLIPPER_READINESS_STATES = [
  'pending',
  'ready',
  'blocked',
  'failed',
] as const;

export type ClipperReadinessState = (typeof CLIPPER_READINESS_STATES)[number];

export const CLIPPER_READY_ACTIONS = [
  'download',
  'edit',
  'publish',
  'retry',
] as const;

export type ClipperReadyAction = (typeof CLIPPER_READY_ACTIONS)[number];

export interface ClipperReadinessContract {
  state: ClipperReadinessState;
  terminal: boolean;
  readyActions: ClipperReadyAction[];
  blockingReasons: string[];
  terminalAt?: string | null;
}

export interface ClipperProjectTerminalContract {
  status: ClipperProjectStatus;
  progress: number;
  readiness: ClipperReadinessContract;
  readyClipCount: number;
  failedClipCount: number;
  pendingClipCount: number;
  terminalAt?: Date | string | null;
  error?: string | null;
}

export interface ClipperResultTerminalContract {
  status: ClipperResultStatus;
  readiness: ClipperReadinessContract;
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
export const CLIPPER_LIBRARY_LINK_STATUSES = [
  'pending',
  'linked',
  'degraded',
  'failed',
] as const;

export type ClipperLibraryLinkStatus =
  (typeof CLIPPER_LIBRARY_LINK_STATUSES)[number];

export function isClipperLibraryLinkStatus(
  value: unknown,
): value is ClipperLibraryLinkStatus {
  return CLIPPER_LIBRARY_LINK_STATUSES.some((status) => status === value);
}

export const CLIPPER_RESULT_GENERATION_SOURCE_PREFIX = 'clipper-result:';

export function clipperResultGenerationSource(clipperResultId: string): string {
  return `${CLIPPER_RESULT_GENERATION_SOURCE_PREFIX}${clipperResultId}`;
}

export function parseClipperResultIdFromGenerationSource(
  value: unknown,
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  if (!value.startsWith(CLIPPER_RESULT_GENERATION_SOURCE_PREFIX)) {
    return undefined;
  }

  const clipperResultId = value.slice(
    CLIPPER_RESULT_GENERATION_SOURCE_PREFIX.length,
  );
  return clipperResultId.length > 0 ? clipperResultId : undefined;
}
