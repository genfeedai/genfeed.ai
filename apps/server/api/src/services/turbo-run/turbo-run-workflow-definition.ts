import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const TURBO_RUN_ACTION_IDS = {
  MARK_QUEUED: 'turbo.run.mark-queued',
  PROCESS: 'turbo.run.process',
  SETTLE: 'turbo.run.settle',
} as const;

export const TURBO_RUN_WORKFLOW_ID = 'run.generation';

export function buildTurboRunWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const ownership: WorkflowVisualNode = {
    data: {
      config: {
        customField: 'ownedElsewhere',
        field: 'custom',
        operator: 'isTrue',
      },
      label: 'Owned by another run?',
    },
    id: 'ownership-check',
    position: { x: 0, y: 320 },
    type: 'condition',
  };
  const edges: WorkflowEdge[] = [
    {
      id: 'mark-to-process',
      source: 'mark-queued',
      target: 'process-run',
      targetHandle: 'queued',
    },
    {
      id: 'process-to-ownership',
      source: 'process-run',
      target: ownership.id,
      targetHandle: 'value',
    },
    {
      id: 'settle-success',
      source: ownership.id,
      sourceHandle: 'false',
      target: 'settle-credits',
      targetHandle: 'completion',
    },
    {
      id: 'settle-failure',
      source: 'process-run',
      sourceHandle: 'failure',
      target: 'settle-credits',
      targetHandle: 'failure',
    },
  ];

  return {
    canonicalId: TURBO_RUN_WORKFLOW_ID,
    organizationModule: 'turbo',
    moduleCompletionNodeIds: ['settle-credits'],
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: 'Turbo run',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: TURBO_RUN_ACTION_IDS.MARK_QUEUED,
          id: 'mark-queued',
          inputVariableKeys: ['request'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: TURBO_RUN_ACTION_IDS.PROCESS,
          id: 'process-run',
          inputVariableKeys: ['request'],
          position: { x: 0, y: 160 },
        }),
        ownership,
        createGenfeedActionNode({
          actionId: TURBO_RUN_ACTION_IDS.SETTLE,
          id: 'settle-credits',
          inputVariableKeys: ['request'],
          position: { x: 0, y: 480 },
        }),
      ],
    },
    description: 'Claims, processes, and settles one durable generation run.',
    label: 'Turbo run Generation',
    resultNodeId: 'process-run',
    version: 1,
  };
}
