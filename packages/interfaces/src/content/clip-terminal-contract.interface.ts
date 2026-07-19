export const CLIP_PROJECT_STATUSES = [
  'pending',
  'transcribing',
  'analyzing',
  'analyzed',
  'clipping',
  'captioning',
  'generating',
  'completed',
  'failed',
] as const;

export type ClipProjectStatus = (typeof CLIP_PROJECT_STATUSES)[number];

export const CLIP_RESULT_STATUSES = [
  'pending',
  'extracting',
  'captioning',
  'completed',
  'failed',
] as const;

export type ClipResultStatus = (typeof CLIP_RESULT_STATUSES)[number];

export const CLIP_TERMINAL_STATUSES = ['completed', 'failed'] as const;

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
