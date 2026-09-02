import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const ENGAGEMENT_SWEEP_ACTION_IDS = {
  DISCOVER: 'engagement.sweep.discover',
  EVALUATE: 'engagement.sweep.evaluate',
  EXECUTE: 'engagement.sweep.execute',
  EXPIRE: 'engagement.sweep.expire',
  FINALIZE_FAILURE: 'engagement.sweep.finalize-failure',
  FINALIZE_SUCCESS: 'engagement.sweep.finalize-success',
  MARK_INELIGIBLE: 'engagement.sweep.mark-ineligible',
  PUBLISH: 'engagement.sweep.publish',
} as const;

export const ENGAGEMENT_SWEEP_WORKFLOW_IDS = {
  PROCESS_RULE: 'engagement.rule.process',
  SWEEP: 'engagement.sweep',
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
  value: unknown,
  y: number,
): WorkflowVisualNode {
  return {
    data: {
      config: {
        customField: field,
        field: 'custom',
        operator: 'equals',
        value,
      },
      label,
    },
    id,
    position: { x: 0, y },
    type: 'condition',
  };
}

export function buildEngagementSweepWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: ENGAGEMENT_SWEEP_WORKFLOW_IDS.SWEEP,
    definition: {
      edges: [
        {
          id: 'discover-to-rules',
          source: 'discover-rules',
          sourceHandle: 'items',
          target: 'process-rules',
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
        actionNode(ENGAGEMENT_SWEEP_ACTION_IDS.DISCOVER, 'discover-rules', 0, [
          'request',
        ]),
        actionNode('workflow.for-each-tenant', 'process-rules', 180, [], {
          childWorkflowId: ENGAGEMENT_SWEEP_WORKFLOW_IDS.PROCESS_RULE,
          itemInputKey: 'request',
          maxConcurrency: 5,
          mode: 'await',
        }),
      ],
    },
    description:
      'Discovers armed engagement rules and processes each in an action-backed child workflow.',
    label: 'Engagement Rule Sweep',
    resultNodeId: 'process-rules',
    version: 1,
  };
}

export function buildEngagementRuleWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const edges: WorkflowEdge[] = [
    {
      id: 'evaluate-trigger',
      source: 'evaluate-rule',
      target: 'is-trigger',
      targetHandle: 'value',
    },
    {
      id: 'trigger-execute',
      source: 'is-trigger',
      sourceHandle: 'true',
      target: 'execute-rule',
      targetHandle: 'evaluation',
    },
    {
      id: 'not-trigger-expire',
      source: 'is-trigger',
      sourceHandle: 'false',
      target: 'is-expire',
      targetHandle: 'value',
    },
    {
      id: 'expire-rule',
      source: 'is-expire',
      sourceHandle: 'true',
      target: 'expire-rule',
      targetHandle: 'evaluation',
    },
    {
      id: 'not-expire-ineligible',
      source: 'is-expire',
      sourceHandle: 'false',
      target: 'is-ineligible',
      targetHandle: 'value',
    },
    {
      id: 'ineligible-rule',
      source: 'is-ineligible',
      sourceHandle: 'true',
      target: 'mark-ineligible',
      targetHandle: 'evaluation',
    },
    {
      id: 'execute-publish-check',
      source: 'execute-rule',
      target: 'requires-publish',
      targetHandle: 'value',
    },
    {
      id: 'publish-rule',
      source: 'requires-publish',
      sourceHandle: 'true',
      target: 'publish-release',
      targetHandle: 'execution',
    },
    {
      id: 'publish-finalize',
      source: 'publish-release',
      target: 'finalize-success',
      targetHandle: 'execution',
    },
    {
      id: 'no-publish-finalize',
      source: 'requires-publish',
      sourceHandle: 'false',
      target: 'finalize-success',
      targetHandle: 'execution',
    },
    {
      id: 'execute-failure',
      source: 'execute-rule',
      sourceHandle: 'failure',
      target: 'finalize-failure',
      targetHandle: 'failure',
    },
    {
      id: 'publish-failure',
      source: 'publish-release',
      sourceHandle: 'failure',
      target: 'finalize-failure',
      targetHandle: 'failure',
    },
  ];
  return {
    canonicalId: ENGAGEMENT_SWEEP_WORKFLOW_IDS.PROCESS_RULE,
    definition: {
      edges,
      inputVariables: [
        { key: 'request', label: 'Rule request', required: true, type: 'json' },
      ],
      nodes: [
        actionNode(ENGAGEMENT_SWEEP_ACTION_IDS.EVALUATE, 'evaluate-rule', 0, [
          'request',
        ]),
        conditionNode('is-trigger', 'Trigger rule?', 'outcome', 'trigger', 120),
        conditionNode('is-expire', 'Expire rule?', 'outcome', 'expire', 240),
        conditionNode(
          'is-ineligible',
          'Rule ineligible?',
          'outcome',
          'ineligible',
          360,
        ),
        actionNode(ENGAGEMENT_SWEEP_ACTION_IDS.EXPIRE, 'expire-rule', 480, [
          'request',
        ]),
        actionNode(
          ENGAGEMENT_SWEEP_ACTION_IDS.MARK_INELIGIBLE,
          'mark-ineligible',
          600,
          ['request'],
        ),
        actionNode(ENGAGEMENT_SWEEP_ACTION_IDS.EXECUTE, 'execute-rule', 720, [
          'request',
        ]),
        conditionNode(
          'requires-publish',
          'Publish release?',
          'requiresPublish',
          true,
          840,
        ),
        actionNode(
          ENGAGEMENT_SWEEP_ACTION_IDS.PUBLISH,
          'publish-release',
          960,
          ['request'],
        ),
        actionNode(
          ENGAGEMENT_SWEEP_ACTION_IDS.FINALIZE_SUCCESS,
          'finalize-success',
          1080,
          ['request'],
        ),
        actionNode(
          ENGAGEMENT_SWEEP_ACTION_IDS.FINALIZE_FAILURE,
          'finalize-failure',
          1200,
          ['request'],
        ),
      ],
    },
    description:
      'Evaluates one engagement rule, routes its terminal outcome, executes one action, and finalizes state.',
    label: 'Process Engagement Rule',
    resultNodeId: 'evaluate-rule',
    version: 1,
  };
}
