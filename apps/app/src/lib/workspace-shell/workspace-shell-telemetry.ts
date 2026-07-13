import {
  ANALYTICS_EVENTS,
  type ConversationShellFallbackReason,
  type ConversationShellState,
  type ConversationShellTransition,
  captureAnalyticsEvent,
} from '@/lib/analytics';

export function captureWorkspaceShellTransition(properties: {
  readonly fromState: ConversationShellState;
  readonly toState: ConversationShellState;
  readonly transition: ConversationShellTransition;
}): void {
  captureAnalyticsEvent(
    ANALYTICS_EVENTS.CONVERSATION_SHELL_TRANSITION,
    properties,
  );
}

export function captureWorkspaceShellFallback(
  reason: ConversationShellFallbackReason,
): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.CONVERSATION_SHELL_FALLBACK, {
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
    { reason },
  );
}
