'use client';

import { ANALYTICS_EVENTS } from './analytics-events';
import { captureAnalyticsEvent } from './posthog-client';

interface WorkflowExecutionSnapshot {
  readonly id: string;
  readonly status: string;
}

const TERMINAL_WORKFLOW_STATUSES = new Set([
  'cancelled',
  'completed',
  'failed',
]);

/**
 * Tracks editor-initiated workflows from launch through their actual terminal
 * execution state. Accepted execution requests are not successes.
 */
export function createEditorWorkflowRunTracker(
  capture: typeof captureAnalyticsEvent = captureAnalyticsEvent,
) {
  const activeExecutionIds = new Set<string>();
  let launchPending = false;

  return {
    trackLaunchAccepted(executionId: string): void {
      if (launchPending) {
        activeExecutionIds.add(executionId);
        launchPending = false;
      }
    },

    trackLaunchFailed(): void {
      if (!launchPending) {
        return;
      }

      capture(ANALYTICS_EVENTS.WORKFLOW_RUN_COMPLETED, {
        outcome: 'failure',
        workflowType: 'editor',
      });
      launchPending = false;
    },

    trackStarted(): void {
      capture(ANALYTICS_EVENTS.WORKFLOW_RUN_STARTED, {
        workflowType: 'editor',
      });
      launchPending = true;
    },

    trackTerminalExecution(execution: WorkflowExecutionSnapshot): void {
      if (
        !activeExecutionIds.has(execution.id) ||
        !TERMINAL_WORKFLOW_STATUSES.has(execution.status)
      ) {
        return;
      }

      capture(ANALYTICS_EVENTS.WORKFLOW_RUN_COMPLETED, {
        outcome: execution.status === 'completed' ? 'success' : 'failure',
        workflowType: 'editor',
      });
      activeExecutionIds.delete(execution.id);
    },
  };
}
