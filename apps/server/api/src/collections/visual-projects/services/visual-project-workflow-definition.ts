import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowRetention } from '@api/collections/workflows/workflow-execution-retention.contract';
import { createGenfeedActionNode } from '@genfeedai/actions';
export function buildVisualProjectWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: 'visual-code.execute',
    organizationModule: 'motion',
    failureWorkflowCanonicalId: 'visual-code.failure',
    label: 'Visual code rendering',
    description:
      'Author, inspect and export one scoped immutable visual revision.',
    version: 1,
    resultNodeId: 'execute',
    retention: SystemWorkflowRetention.KEPT,
    definition: {
      edges: [],
      inputVariables: [
        { key: 'job', label: 'Visual revision', required: true, type: 'json' },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: 'visual-code.execute-internal',
          id: 'execute',
          inputVariableKeys: ['job'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
  };
}

export function buildVisualProjectFailureWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: 'visual-code.failure',
    label: 'Reconcile failed visual rendering',
    description:
      'Reconcile one admitted terminal failure without new provider work.',
    version: 1,
    resultNodeId: 'fail',
    retention: SystemWorkflowRetention.KEPT,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'job',
          label: 'Failed visual revision',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: 'visual-code.fail-internal',
          id: 'fail',
          inputVariableKeys: ['job'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
  };
}
