import {
  ANALYTICS_EVENTS,
  type AnalyticsOutcome,
  type ConversationShellFallbackReason,
  type ConversationShellState,
  type ConversationShellTelemetryContext,
  type ConversationShellTransition,
  captureAnalyticsEvent,
} from '@/lib/analytics';

type WorkspaceShellOverlayTelemetryClass =
  | 'library_picker'
  | 'notifications'
  | 'shell_preview'
  | 'workflow_picker';

const UNKNOWN_TELEMETRY_CONTEXT: ConversationShellTelemetryContext = {
  cohort: 'unassigned',
  configVersion: 'unconfigured',
  deploymentMode: 'unknown',
  isInternal: false,
  rollbackRevision: 0,
};

let telemetryContext = UNKNOWN_TELEMETRY_CONTEXT;

export function setWorkspaceShellTelemetryContext(
  evaluation: {
    readonly cohort: 'all' | 'internal' | 'opt_in' | null;
    readonly configVersion: string | null;
    readonly deploymentMode:
      | 'community'
      | 'desktop_cloud'
      | 'desktop_self_hosted'
      | 'saas';
    readonly rollbackRevision: number | null;
  } | null,
): void {
  telemetryContext = evaluation
    ? {
        cohort: evaluation.cohort ?? 'unassigned',
        configVersion: evaluation.configVersion ?? 'unconfigured',
        deploymentMode: evaluation.deploymentMode,
        isInternal: evaluation.cohort === 'internal',
        rollbackRevision: evaluation.rollbackRevision ?? 0,
      }
    : UNKNOWN_TELEMETRY_CONTEXT;
}

export function captureWorkspaceShellSession(): void {
  captureAnalyticsEvent(
    ANALYTICS_EVENTS.CONVERSATION_SHELL_SESSION,
    telemetryContext,
  );
}

export function captureWorkspaceShellTransition(properties: {
  readonly fromState: ConversationShellState;
  readonly toState: ConversationShellState;
  readonly transition: ConversationShellTransition;
}): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.CONVERSATION_SHELL_TRANSITION, {
    ...telemetryContext,
    ...properties,
  });
}

export function captureWorkspaceShellFallback(
  reason: ConversationShellFallbackReason,
): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.CONVERSATION_SHELL_FALLBACK, {
    ...telemetryContext,
    reason,
  });
}

export function captureWorkspaceShellRestorationFailure(
  reason:
    | 'invalid_overlay'
    | 'invalid_overlay_reference'
    | 'invalid_thread'
    | 'stale_overlay_reference'
    | 'unauthorized_overlay_reference',
): void {
  captureAnalyticsEvent(
    ANALYTICS_EVENTS.CONVERSATION_SHELL_RESTORATION_FAILURE,
    { ...telemetryContext, reason },
  );
}

export function captureWorkspaceShellScopeCorrection(
  outcome: AnalyticsOutcome,
): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.CONVERSATION_SHELL_SCOPE_CORRECTION, {
    ...telemetryContext,
    outcome,
    source: 'surface_adapter',
  });
}

export function captureWorkspaceShellOverlayAbandonment(
  overlayClass: WorkspaceShellOverlayTelemetryClass,
): void {
  captureAnalyticsEvent(
    ANALYTICS_EVENTS.CONVERSATION_SHELL_OVERLAY_ABANDONMENT,
    { ...telemetryContext, overlayClass },
  );
}

export function captureWorkspaceShellApproval(properties: {
  readonly action: 'approve' | 'execute' | 'reject' | 'revoke';
  readonly integrity: 'blocked' | 'matched' | 'not_applicable';
  readonly outcome: AnalyticsOutcome;
}): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.CONVERSATION_SHELL_APPROVAL, {
    ...telemetryContext,
    ...properties,
  });
}

export function captureWorkspaceShellPerformance(properties: {
  readonly deviceClass: 'desktop' | 'mobile';
  readonly durationMs: number;
  readonly routeClass: 'agent' | 'management' | 'product';
  readonly shellMode: 'conversation' | 'legacy';
}): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.CONVERSATION_SHELL_PERFORMANCE, {
    ...telemetryContext,
    ...properties,
    metric: 'first_useful_paint',
  });
}

export function captureWorkspaceShellError(
  stage: 'evaluation' | 'render' | 'restoration' | 'scope',
  code:
    | 'render_failed'
    | 'request_failed'
    | 'restoration_failed'
    | 'scope_sync_failed',
): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.CONVERSATION_SHELL_ERROR, {
    ...telemetryContext,
    code,
    stage,
  });
}
