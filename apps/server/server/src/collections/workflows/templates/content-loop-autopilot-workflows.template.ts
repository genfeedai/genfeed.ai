import {
  ANALYTICS_GENERIC_SYNC_ITEM_WORKFLOW_ID,
  ANALYTICS_SYNC_ACTION_IDS,
} from '@server/collections/workflows/templates/analytics-sync-workflows.template';
import { createTemplateActionNode } from '@server/collections/workflows/templates/template-action-node';
import type { WorkflowTemplate } from '@server/collections/workflows/templates/workflow-templates';

export type ContentLoopAutopilotWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

/**
 * #3018 — closes the analytics → winners loop without an operator: dispatch
 * the organization's incremental analytics sync, then sweep every connected
 * brand and promote its top performers into the harness performance-winners
 * context base. Both actions are org-scoped, idempotent (each locks its own
 * window and de-dupes inside `promoteTopPerformers`), and diagnosable per
 * node in the workflow's execution history.
 *
 * Catalog-install only. Each analytics record is persisted through the same
 * item workflow used by the standalone analytics sync before promotion runs.
 */
export const CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES = [
  {
    category: 'analytics',
    description:
      "Daily per-organization sweep: refresh analytics, then promote every connected brand's top performers into its harness performance-winners context so the content loop keeps improving without a human running it.",
    edges: [
      {
        id: 'e-window-discover',
        source: 'resolveAnalyticsWindow',
        target: 'discoverAnalytics',
        targetHandle: 'window',
      },
      {
        id: 'e-discover-sync',
        source: 'discoverAnalytics',
        sourceHandle: 'items',
        target: 'syncEachAnalyticsItem',
        targetHandle: 'items',
      },
      {
        id: 'e-sync-promote',
        source: 'syncEachAnalyticsItem',
        target: 'harnessWinnerPromotionSweep',
      },
    ],
    icon: 'trophy',
    id: 'content-loop-autopilot',
    name: 'Content Loop Autopilot',
    nodes: [
      createTemplateActionNode(
        ANALYTICS_SYNC_ACTION_IDS.GENERIC_RESOLVE_WINDOW,
        {
          data: { config: {}, label: 'Resolve Analytics Window' },
          id: 'resolveAnalyticsWindow',
          position: { x: 0, y: 120 },
        },
      ),
      createTemplateActionNode(ANALYTICS_SYNC_ACTION_IDS.GENERIC_DISCOVER, {
        data: { config: {}, label: 'Discover Analytics' },
        id: 'discoverAnalytics',
        position: { x: 360, y: 120 },
      }),
      createTemplateActionNode('workflow.for-each', {
        data: {
          config: {
            childWorkflowId: ANALYTICS_GENERIC_SYNC_ITEM_WORKFLOW_ID,
            itemInputKey: 'item',
            maxConcurrency: 5,
            mode: 'await',
          },
          label: 'Sync Each Analytics Item',
        },
        id: 'syncEachAnalyticsItem',
        position: { x: 720, y: 120 },
      }),
      createTemplateActionNode('harnessWinnerPromotionSweep', {
        data: { config: {}, label: 'Promote Top Performers' },
        id: 'harnessWinnerPromotionSweep',
        position: { x: 1080, y: 120 },
      }),
    ],
    schedule: '0 8 * * *',
    version: 3,
  },
] satisfies ContentLoopAutopilotWorkflowTemplate[];
