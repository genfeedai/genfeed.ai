import { AUTOMATION_WORKFLOW_IDS } from '@api/collections/workflows/services/automation-workflow-definitions';
import { createTemplateActionNode } from '@api/collections/workflows/templates/template-action-node';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type ContentLoopAutopilotWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

/**
 * #3018 — closes the analytics → winners loop without an operator: sweep every
 * connected brand and promote its top performers into the harness
 * performance-winners context base. The child workflow is org-scoped,
 * idempotent, and diagnosable at each atomic node in workflow execution
 * history.
 *
 * #5634 — analytics collection is owned by the `analytics-sync` workflow
 * (every 6h). This daily run only promotes winners from the data that sync
 * already produced; it no longer repeats analytics discovery and item sync.
 *
 * Catalog-install only.
 */
export const CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES = [
  {
    category: 'analytics',
    description:
      "Daily per-organization sweep: promote every connected brand's top performers from the analytics already synced into its harness performance-winners context so the content loop keeps improving without a human running it.",
    edges: [],
    icon: 'trophy',
    id: 'content-loop-autopilot',
    name: 'Content Loop Autopilot',
    nodes: [
      createTemplateActionNode('workflow.run-child', {
        data: {
          config: {
            childWorkflowId: AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS,
          },
          label: 'Promote Top Performers',
        },
        id: 'promoteHarnessWinners',
        position: { x: 0, y: 120 },
      }),
    ],
    schedule: '0 8 * * *',
    version: 4,
  },
] satisfies ContentLoopAutopilotWorkflowTemplate[];
