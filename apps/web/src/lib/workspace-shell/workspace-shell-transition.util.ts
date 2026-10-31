import type { WorkspaceShellOverlayRegistration } from '@genfeedai/contracts/interfaces';
import type { WorkspaceShellState } from '@/lib/workspace-shell/workspace-shell-location';

type WorkspaceShellOverlayTelemetryClass =
  WorkspaceShellOverlayRegistration['telemetryClass'];

export type WorkspaceShellPendingTransition =
  | 'canvas_launch'
  | 'conversation_return'
  | 'overlay_dismiss'
  | 'overlay_open';

export function resolveWorkspaceShellTransition(input: {
  normalizedPathname: string;
  pendingTransition: WorkspaceShellPendingTransition | null;
  previousPathname: string | null;
  previousState: WorkspaceShellState | null;
  state: WorkspaceShellState;
}):
  | WorkspaceShellPendingTransition
  | 'browser'
  | 'canvas_change'
  | 'initial_restore' {
  if (input.pendingTransition) {
    return input.pendingTransition;
  }

  if (input.previousState === null) {
    return 'initial_restore';
  }

  if (
    input.previousState === 'canvas' &&
    input.state === 'canvas' &&
    input.previousPathname !== input.normalizedPathname
  ) {
    return 'canvas_change';
  }

  return 'browser';
}

export type OverlayTelemetryUpdate = {
  readonly abandonedTelemetryClass: WorkspaceShellOverlayTelemetryClass | null;
  readonly nextCompleted: boolean;
  readonly nextTelemetryClass: WorkspaceShellOverlayTelemetryClass | null;
};

export function resolveOverlayTelemetryUpdate(input: {
  currentTelemetryClass: WorkspaceShellOverlayTelemetryClass | null;
  isOverlayCompleted: boolean;
  overlayTelemetryClass: WorkspaceShellOverlayTelemetryClass | null;
  previousState: WorkspaceShellState | null;
  state: WorkspaceShellState;
}): OverlayTelemetryUpdate {
  if (input.state === 'overlay') {
    return resolveOpenOverlayTelemetry(input);
  }

  if (input.previousState !== 'overlay') {
    return {
      abandonedTelemetryClass: null,
      nextCompleted: input.isOverlayCompleted,
      nextTelemetryClass: input.currentTelemetryClass,
    };
  }

  return {
    abandonedTelemetryClass: abandonedOverlayTelemetryClass(input),
    nextCompleted: false,
    nextTelemetryClass: null,
  };
}

function resolveOpenOverlayTelemetry(input: {
  currentTelemetryClass: WorkspaceShellOverlayTelemetryClass | null;
  isOverlayCompleted: boolean;
  overlayTelemetryClass: WorkspaceShellOverlayTelemetryClass | null;
  previousState: WorkspaceShellState | null;
}): OverlayTelemetryUpdate {
  if (!input.overlayTelemetryClass) {
    return {
      abandonedTelemetryClass: null,
      nextCompleted: input.isOverlayCompleted,
      nextTelemetryClass: input.currentTelemetryClass,
    };
  }

  return {
    abandonedTelemetryClass: null,
    nextCompleted:
      input.previousState === 'overlay' ? input.isOverlayCompleted : false,
    nextTelemetryClass: input.overlayTelemetryClass,
  };
}

function abandonedOverlayTelemetryClass(input: {
  currentTelemetryClass: WorkspaceShellOverlayTelemetryClass | null;
  isOverlayCompleted: boolean;
}): WorkspaceShellOverlayTelemetryClass | null {
  if (input.isOverlayCompleted) {
    return null;
  }

  return input.currentTelemetryClass;
}

export function shouldRestorePrimaryFocus(input: {
  hasOverlayReturnFocus: boolean;
  previousState: WorkspaceShellState | null;
  state: WorkspaceShellState;
}): boolean {
  if (input.state === 'overlay') {
    return false;
  }

  if (input.previousState === null) {
    return false;
  }

  return !shouldSkipPrimaryFocusRestore(input);
}

function shouldSkipPrimaryFocusRestore(input: {
  hasOverlayReturnFocus: boolean;
  previousState: WorkspaceShellState | null;
}): boolean {
  return input.previousState === 'overlay' && input.hasOverlayReturnFocus;
}
