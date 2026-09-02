import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const WORKFLOW_ARTIFACT_MAINTENANCE_WORKFLOW_IDS = {
  CLEANUP_EXECUTION: 'workflow.artifact.cleanup.execution',
  CLEANUP_EXPIRED_SCOPE: 'workflow.artifact.cleanup.expired-scope',
  CLEANUP_SWEEP: 'workflow.artifact.cleanup.sweep',
} as const;

function node(
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

export function buildWorkflowArtifactCleanupExecutionDefinition(
  actionId: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId: WORKFLOW_ARTIFACT_MAINTENANCE_WORKFLOW_IDS.CLEANUP_EXECUTION,
    definition: {
      edges: [],
      inputVariables: [
        { key: 'reason', label: 'Reason', required: true, type: 'string' },
        {
          key: 'targetExecutionId',
          label: 'Execution',
          required: true,
          type: 'string',
        },
      ],
      nodes: [node(actionId, 'cleanup', 0, ['reason', 'targetExecutionId'])],
    },
    description: 'Cleans artifacts for one terminal workflow execution.',
    label: 'Cleanup Workflow Artifacts',
    resultNodeId: 'cleanup',
    version: 1,
  };
}

export function buildWorkflowArtifactExpiredScopeDefinition(
  actionId: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId:
      WORKFLOW_ARTIFACT_MAINTENANCE_WORKFLOW_IDS.CLEANUP_EXPIRED_SCOPE,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'request',
          label: 'Expired execution',
          required: true,
          type: 'json',
        },
      ],
      nodes: [node(actionId, 'cleanup', 0, ['request'])],
    },
    description: 'Applies retention and cleans one expired workflow execution.',
    label: 'Cleanup Expired Workflow Scope',
    resultNodeId: 'cleanup',
    version: 1,
  };
}

export function buildWorkflowArtifactCleanupSweepDefinition(
  discoverActionId: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId: WORKFLOW_ARTIFACT_MAINTENANCE_WORKFLOW_IDS.CLEANUP_SWEEP,
    definition: {
      edges: [
        {
          id: 'discover-cleanup',
          source: 'discover',
          sourceHandle: 'items',
          target: 'cleanup',
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
        node(discoverActionId, 'discover', 0, ['request']),
        node('workflow.for-each-tenant', 'cleanup', 180, [], {
          childWorkflowId:
            WORKFLOW_ARTIFACT_MAINTENANCE_WORKFLOW_IDS.CLEANUP_EXPIRED_SCOPE,
          itemInputKey: 'request',
          maxConcurrency: 5,
          mode: 'await',
        }),
      ],
    },
    description:
      'Discovers expired workflow executions and cleans each in a child workflow.',
    label: 'Workflow Artifact Cleanup Sweep',
    resultNodeId: 'cleanup',
    version: 1,
  };
}
