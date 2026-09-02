import type { WorkflowVisualNode } from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const STREAK_MAINTENANCE_ACTION_IDS = {
  APPLY_FREEZE: 'streak.record.apply-freeze',
  BREAK: 'streak.record.break',
  DISCOVER_ORGANIZATIONS: 'streak.sweep.discover-organizations',
  DISCOVER_RECORDS: 'streak.organization.discover-records',
  EVALUATE: 'streak.record.evaluate',
  NOTIFY_AT_RISK: 'streak.record.notify-at-risk',
  NOTIFY_BROKEN: 'streak.record.notify-broken',
  NOTIFY_FREEZE: 'streak.record.notify-freeze',
} as const;

export const STREAK_MAINTENANCE_WORKFLOW_IDS = {
  ORGANIZATION: 'streak.organization.process',
  RECORD: 'streak.record.process',
  SWEEP: 'streak.sweep',
} as const;

function actionNode(
  actionId: string,
  id: string,
  y: number,
  inputVariableKeys: string[] = [],
  parameters: Record<string, unknown> = {},
) {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys,
    parameters,
    position: { x: 0, y },
  });
}

function conditionNode(
  id: string,
  label: string,
  field: string,
  y: number,
): WorkflowVisualNode {
  return {
    data: {
      config: { customField: field, field: 'custom', operator: 'isTrue' },
      label,
    },
    id,
    position: { x: 0, y },
    type: 'condition',
  };
}

export function buildStreakSweepWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: STREAK_MAINTENANCE_WORKFLOW_IDS.SWEEP,
    definition: {
      edges: [
        {
          id: 'discover-organizations',
          source: 'discover-organizations',
          sourceHandle: 'items',
          target: 'process-organizations',
          targetHandle: 'items',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Sweep request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        actionNode(
          STREAK_MAINTENANCE_ACTION_IDS.DISCOVER_ORGANIZATIONS,
          'discover-organizations',
          0,
          ['request'],
        ),
        actionNode(
          'workflow.for-each-tenant',
          'process-organizations',
          180,
          [],
          {
            childWorkflowId: STREAK_MAINTENANCE_WORKFLOW_IDS.ORGANIZATION,
            itemInputKey: 'request',
            maxConcurrency: 3,
            mode: 'await',
          },
        ),
      ],
    },
    description:
      'Discovers organizations with streaks and runs maintenance for each.',
    label: 'Streak Maintenance Sweep',
    resultNodeId: 'process-organizations',
    version: 1,
  };
}

export function buildStreakOrganizationWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: STREAK_MAINTENANCE_WORKFLOW_IDS.ORGANIZATION,
    definition: {
      edges: [
        {
          id: 'discover-records',
          source: 'discover-records',
          sourceHandle: 'items',
          target: 'process-records',
          targetHandle: 'items',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Organization maintenance request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        actionNode(
          STREAK_MAINTENANCE_ACTION_IDS.DISCOVER_RECORDS,
          'discover-records',
          0,
          ['request'],
        ),
        actionNode('workflow.for-each', 'process-records', 180, [], {
          childWorkflowId: STREAK_MAINTENANCE_WORKFLOW_IDS.RECORD,
          itemInputKey: 'request',
          maxConcurrency: 5,
          mode: 'await',
        }),
      ],
    },
    description:
      'Discovers live streak records and fans each into atomic maintenance.',
    label: 'Process Organization Streaks',
    resultNodeId: 'process-records',
    version: 1,
  };
}

export function buildStreakRecordWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: STREAK_MAINTENANCE_WORKFLOW_IDS.RECORD,
    definition: {
      edges: [
        {
          id: 'evaluate-at-risk',
          source: 'evaluate',
          target: 'is-at-risk',
          targetHandle: 'value',
        },
        {
          id: 'notify-at-risk',
          source: 'is-at-risk',
          sourceHandle: 'true',
          target: 'notify-at-risk',
          targetHandle: 'evaluation',
        },
        {
          id: 'evaluate-freeze',
          source: 'evaluate',
          target: 'should-freeze',
          targetHandle: 'value',
        },
        {
          id: 'apply-freeze',
          source: 'should-freeze',
          sourceHandle: 'true',
          target: 'apply-freeze',
          targetHandle: 'evaluation',
        },
        {
          id: 'freeze-notification',
          source: 'apply-freeze',
          target: 'notify-freeze',
          targetHandle: 'evaluation',
        },
        {
          id: 'evaluate-break',
          source: 'evaluate',
          target: 'should-break',
          targetHandle: 'value',
        },
        {
          id: 'break-streak',
          source: 'should-break',
          sourceHandle: 'true',
          target: 'break-streak',
          targetHandle: 'evaluation',
        },
        {
          id: 'broken-notification',
          source: 'break-streak',
          target: 'notify-broken',
          targetHandle: 'evaluation',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Streak record',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        actionNode(STREAK_MAINTENANCE_ACTION_IDS.EVALUATE, 'evaluate', 0, [
          'request',
        ]),
        conditionNode('is-at-risk', 'At risk?', 'isAtRisk', 120),
        actionNode(
          STREAK_MAINTENANCE_ACTION_IDS.NOTIFY_AT_RISK,
          'notify-at-risk',
          240,
        ),
        conditionNode(
          'should-freeze',
          'Use streak freeze?',
          'shouldUseFreeze',
          120,
        ),
        actionNode(
          STREAK_MAINTENANCE_ACTION_IDS.APPLY_FREEZE,
          'apply-freeze',
          240,
        ),
        actionNode(
          STREAK_MAINTENANCE_ACTION_IDS.NOTIFY_FREEZE,
          'notify-freeze',
          360,
        ),
        conditionNode('should-break', 'Break streak?', 'shouldBreak', 120),
        actionNode(STREAK_MAINTENANCE_ACTION_IDS.BREAK, 'break-streak', 240),
        actionNode(
          STREAK_MAINTENANCE_ACTION_IDS.NOTIFY_BROKEN,
          'notify-broken',
          360,
        ),
      ],
    },
    description:
      'Evaluates one streak record, applies its state transition, and sends its notification.',
    label: 'Process Streak Record',
    resultNodeId: 'evaluate',
    version: 1,
  };
}
