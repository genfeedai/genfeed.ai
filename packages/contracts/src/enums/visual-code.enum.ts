export enum VisualCodeStatus {
  QUEUED = 'queued',
  AUTHORING = 'authoring',
  CHECKING = 'checking',
  RENDERING = 'rendering',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/** Revision statuses that end a Motion render; polling stops here. */
export const VISUAL_CODE_TERMINAL_STATUSES: ReadonlySet<VisualCodeStatus> =
  new Set([
    VisualCodeStatus.COMPLETED,
    VisualCodeStatus.FAILED,
    VisualCodeStatus.CANCELLED,
  ]);

export function isTerminalVisualCodeStatus(status: VisualCodeStatus): boolean {
  return VISUAL_CODE_TERMINAL_STATUSES.has(status);
}
