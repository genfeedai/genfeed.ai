import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const AB_TEST_WORKFLOW_IDS = {
  EXECUTE: 'content.optimization.ab-test.execute',
  EXECUTE_ARM: 'content.optimization.ab-test.execute-arm',
  LOAD_VALIDATED: 'content.optimization.ab-test.load-validated',
  RESOLVE: 'content.optimization.ab-test.resolve',
  RESOLVE_OUTCOME: 'content.optimization.ab-test.resolve-outcome',
} as const;

export const AB_TEST_ACTION_IDS = {
  CREATE_ARM: 'content.optimization.ab-test.arm.create',
  FINALIZE_EXECUTION: 'content.optimization.ab-test.execution.finalize',
  FINALIZE_RESOLUTION: 'content.optimization.ab-test.resolution.finalize',
  LOAD_VALIDATED: 'content.optimization.ab-test.validated.load',
  PERSIST_OUTCOME: 'content.optimization.ab-test.outcome.persist',
  PLAN_EXECUTION: 'content.optimization.ab-test.execution.plan',
  PLAN_RESOLUTION: 'content.optimization.ab-test.resolution.plan',
} as const;

function requestVariable() {
  return {
    key: 'request',
    label: 'A/B test request',
    required: true,
    type: 'json' as const,
  };
}

export function buildAbTestExecutionWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: AB_TEST_WORKFLOW_IDS.EXECUTE,
    definition: {
      edges: [
        {
          id: 'plan-to-arms',
          source: 'plan-execution',
          sourceHandle: 'items',
          target: 'create-arms',
          targetHandle: 'items',
        },
        {
          id: 'plan-to-finalize',
          source: 'plan-execution',
          target: 'finalize-execution',
          targetHandle: 'plan',
        },
        {
          id: 'arms-to-finalize',
          source: 'create-arms',
          target: 'finalize-execution',
          targetHandle: 'arms',
        },
      ],
      inputVariables: [requestVariable()],
      nodes: [
        createGenfeedActionNode({
          actionId: AB_TEST_ACTION_IDS.PLAN_EXECUTION,
          id: 'plan-execution',
          inputVariableKeys: ['request'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'create-arms',
          parameters: {
            childWorkflowId: AB_TEST_WORKFLOW_IDS.EXECUTE_ARM,
            itemInputKey: 'item',
            maxConcurrency: 2,
            mode: 'await',
          },
          position: { x: 0, y: 220 },
        }),
        createGenfeedActionNode({
          actionId: AB_TEST_ACTION_IDS.FINALIZE_EXECUTION,
          id: 'finalize-execution',
          position: { x: 0, y: 440 },
        }),
      ],
    },
    description:
      'Plans and creates each A/B test arm through a child workflow.',
    label: 'Execute Content A/B Test',
    resultNodeId: 'finalize-execution',
    version: 1,
  };
}

export function buildAbTestArmWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return singleItemDefinition(
    AB_TEST_WORKFLOW_IDS.EXECUTE_ARM,
    AB_TEST_ACTION_IDS.CREATE_ARM,
    'create-arm',
    'Create Content A/B Test Arm',
  );
}

export function buildAbTestResolutionWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: AB_TEST_WORKFLOW_IDS.RESOLVE,
    definition: {
      edges: [
        {
          id: 'plan-to-outcomes',
          source: 'plan-resolution',
          sourceHandle: 'items',
          target: 'persist-outcomes',
          targetHandle: 'items',
        },
        {
          id: 'outcomes-to-finalize',
          source: 'persist-outcomes',
          target: 'finalize-resolution',
          targetHandle: 'outcomes',
        },
      ],
      inputVariables: [requestVariable()],
      nodes: [
        createGenfeedActionNode({
          actionId: AB_TEST_ACTION_IDS.PLAN_RESOLUTION,
          id: 'plan-resolution',
          inputVariableKeys: ['request'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'persist-outcomes',
          parameters: {
            childWorkflowId: AB_TEST_WORKFLOW_IDS.RESOLVE_OUTCOME,
            itemInputKey: 'item',
            maxConcurrency: 5,
            mode: 'await',
          },
          position: { x: 0, y: 220 },
        }),
        createGenfeedActionNode({
          actionId: AB_TEST_ACTION_IDS.FINALIZE_RESOLUTION,
          id: 'finalize-resolution',
          position: { x: 0, y: 440 },
        }),
      ],
    },
    description:
      'Scores candidate experiments and persists each resolved outcome through a child workflow.',
    label: 'Resolve Content A/B Tests',
    resultNodeId: 'finalize-resolution',
    version: 1,
  };
}

export function buildAbTestOutcomeWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return singleItemDefinition(
    AB_TEST_WORKFLOW_IDS.RESOLVE_OUTCOME,
    AB_TEST_ACTION_IDS.PERSIST_OUTCOME,
    'persist-outcome',
    'Persist Content A/B Test Outcome',
  );
}

export function buildValidatedAbTestsWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: AB_TEST_WORKFLOW_IDS.LOAD_VALIDATED,
    definition: {
      edges: [],
      inputVariables: [requestVariable()],
      nodes: [
        createGenfeedActionNode({
          actionId: AB_TEST_ACTION_IDS.LOAD_VALIDATED,
          id: 'load-validated',
          inputVariableKeys: ['request'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: 'Loads validated A/B test outcomes for one brand.',
    label: 'Load Validated Content A/B Tests',
    resultNodeId: 'load-validated',
    version: 1,
  };
}

function singleItemDefinition(
  canonicalId: string,
  actionId: string,
  nodeId: string,
  label: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'item',
          label: 'A/B test item',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId,
          id: nodeId,
          inputVariableKeys: ['item'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: label,
    label,
    resultNodeId: nodeId,
    version: 1,
  };
}

export const AB_TEST_WORKFLOW_DEFINITIONS = [
  buildAbTestExecutionWorkflowDefinition(),
  buildAbTestArmWorkflowDefinition(),
  buildAbTestResolutionWorkflowDefinition(),
  buildAbTestOutcomeWorkflowDefinition(),
  buildValidatedAbTestsWorkflowDefinition(),
] satisfies SystemWorkflowGraphDefinition[];
