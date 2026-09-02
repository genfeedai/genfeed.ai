import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const INSIGHT_GENERATION_ACTION_IDS = {
  GENERATE: 'insight.generate-drafts',
  LOAD: 'insight.load-generation-context',
  PERSIST: 'insight.persist-generated',
} as const;

export const INSIGHT_GENERATION_WORKFLOW_ID = 'insight.generation';

export function buildInsightGenerationWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: INSIGHT_GENERATION_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'load-to-generate',
          source: 'load-context',
          target: 'generate-drafts',
          targetHandle: 'plan',
        },
        {
          id: 'load-to-persist',
          source: 'load-context',
          target: 'persist-insights',
          targetHandle: 'plan',
        },
        {
          id: 'generate-to-persist',
          source: 'generate-drafts',
          target: 'persist-insights',
          targetHandle: 'generated',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Insight generation',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: INSIGHT_GENERATION_ACTION_IDS.LOAD,
          id: 'load-context',
          inputVariableKeys: ['request'],
        }),
        createGenfeedActionNode({
          actionId: INSIGHT_GENERATION_ACTION_IDS.GENERATE,
          id: 'generate-drafts',
        }),
        createGenfeedActionNode({
          actionId: INSIGHT_GENERATION_ACTION_IDS.PERSIST,
          id: 'persist-insights',
        }),
      ],
    },
    description: 'Loads, generates, and persists actionable insights.',
    label: 'Insight Generation',
    resultNodeId: 'persist-insights',
    version: 1,
  };
}
