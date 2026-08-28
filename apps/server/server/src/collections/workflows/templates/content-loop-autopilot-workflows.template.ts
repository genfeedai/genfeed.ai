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
 * Catalog-install only. Brands without a connected credential are skipped
 * inside each node (`credentialPolicy: 'tenant-connected-account'`), never a
 * hard failure.
 */
export const CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES = [
  {
    category: 'analytics',
    description:
      "Daily per-organization sweep: refresh analytics, then promote every connected brand's top performers into its harness performance-winners context so the content loop keeps improving without a human running it.",
    edges: [
      {
        id: 'e-sync-promote',
        source: 'analyticsGenericSync',
        target: 'harnessWinnerPromotionSweep',
      },
    ],
    icon: 'trophy',
    id: 'content-loop-autopilot',
    name: 'Content Loop Autopilot',
    nodes: [
      createTemplateActionNode('analyticsGenericSync', {
        data: { config: {}, label: 'Sync Analytics' },
        id: 'analyticsGenericSync',
        position: { x: 0, y: 120 },
      }),
      createTemplateActionNode('harnessWinnerPromotionSweep', {
        data: { config: {}, label: 'Promote Top Performers' },
        id: 'harnessWinnerPromotionSweep',
        position: { x: 360, y: 120 },
      }),
    ],
    schedule: '0 8 * * *',
  },
] satisfies ContentLoopAutopilotWorkflowTemplate[];
