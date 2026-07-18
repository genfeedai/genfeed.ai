import { getClientSurface, getDeployment } from '@genfeedai/config/deployment';
import {
  ANALYTICS_EVENTS,
  type AnalyticsOutcome,
  type ConversationShellRestorationFailureReason,
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

function getWorkspaceShellTelemetryContext(): ConversationShellTelemetryContext {
  const client = getClientSurface();
  const deployment = getDeployment();
  const deploymentMode =
    client === 'desktop'
      ? deployment === 'cloud'
        ? 'desktop_cloud'
        : 'desktop_self_hosted'
      : deployment === 'cloud'
        ? 'saas'
        : 'community';

  return {
    deploymentMode,
  };
}

export function captureWorkspaceShellSession(): void {
  captureAnalyticsEvent(
    ANALYTICS_EVENTS.CONVERSATION_SHELL_SESSION,
    getWorkspaceShellTelemetryContext(),
  );
}

export function captureWorkspaceShellTransition(properties: {
  readonly fromState: ConversationShellState;
  readonly toState: ConversationShellState;
  readonly transition: ConversationShellTransition;
}): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.CONVERSATION_SHELL_TRANSITION, {
    ...getWorkspaceShellTelemetryContext(),
    ...properties,
  });
}

export function captureWorkspaceShellRestorationFailure(
  reason: ConversationShellRestorationFailureReason,
): void {
  captureAnalyticsEvent(
    ANALYTICS_EVENTS.CONVERSATION_SHELL_RESTORATION_FAILURE,
    { ...getWorkspaceShellTelemetryContext(), reason },
  );
}

export function captureWorkspaceShellScopeCorrection(
  outcome: AnalyticsOutcome,
): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.CONVERSATION_SHELL_SCOPE_CORRECTION, {
    ...getWorkspaceShellTelemetryContext(),
    outcome,
    source: 'surface_adapter',
  });
}

export function captureWorkspaceShellOverlayAbandonment(
  overlayClass: WorkspaceShellOverlayTelemetryClass,
): void {
  captureAnalyticsEvent(
    ANALYTICS_EVENTS.CONVERSATION_SHELL_OVERLAY_ABANDONMENT,
    { ...getWorkspaceShellTelemetryContext(), overlayClass },
  );
}

export function captureWorkspaceShellApproval(properties: {
  readonly action: 'approve' | 'execute' | 'reject' | 'revoke';
  readonly integrity: 'blocked' | 'matched' | 'not_applicable';
  readonly outcome: AnalyticsOutcome;
}): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.CONVERSATION_SHELL_APPROVAL, {
    ...getWorkspaceShellTelemetryContext(),
    ...properties,
  });
}

export function captureWorkspaceShellPerformance(properties: {
  readonly deviceClass: 'desktop' | 'mobile';
  readonly durationMs: number;
  readonly routeClass: 'agent' | 'management' | 'product';
  readonly shellMode: 'conversation';
}): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.CONVERSATION_SHELL_PERFORMANCE, {
    ...getWorkspaceShellTelemetryContext(),
    ...properties,
    metric: 'first_useful_paint',
  });
}

export function captureWorkspaceShellError(
  stage: 'render' | 'restoration' | 'scope',
  code:
    | 'render_failed'
    | 'request_failed'
    | 'restoration_failed'
    | 'scope_sync_failed',
): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.CONVERSATION_SHELL_ERROR, {
    ...getWorkspaceShellTelemetryContext(),
    code,
    stage,
  });
}
