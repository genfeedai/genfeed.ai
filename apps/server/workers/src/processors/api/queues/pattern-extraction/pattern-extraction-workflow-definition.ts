import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const PATTERN_EXTRACTION_WORKFLOW_ID = 'patterns.extract-organization';
export const PATTERN_EXTRACTION_ITEM_WORKFLOW_ID = 'patterns.persist-candidate';

export const PATTERN_EXTRACTION_ACTION_IDS = {
  BUILD: 'patterns.extraction.build',
  LOAD: 'patterns.extraction.load',
  PERSIST: 'patterns.extraction.persist-candidate',
  SAVE: 'patterns.extraction.save-checkpoints',
  SCAN_ADS: 'patterns.extraction.scan-ads',
  SCAN_CONTENT: 'patterns.extraction.scan-content',
} as const;

export function buildPatternExtractionWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: PATTERN_EXTRACTION_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'load-to-ads',
          source: 'load-checkpoints',
          target: 'scan-ads',
          targetHandle: 'state',
        },
        {
          id: 'ads-to-content',
          source: 'scan-ads',
          target: 'scan-content',
          targetHandle: 'state',
        },
        {
          id: 'content-to-build',
          source: 'scan-content',
          target: 'build-patterns',
          targetHandle: 'state',
        },
        {
          id: 'build-to-persist',
          source: 'build-patterns',
          sourceHandle: 'items',
          target: 'persist-patterns',
          targetHandle: 'items',
        },
        {
          id: 'build-to-save',
          source: 'build-patterns',
          target: 'save-checkpoints',
          targetHandle: 'state',
        },
        {
          id: 'persist-to-save',
          source: 'persist-patterns',
          target: 'save-checkpoints',
          targetHandle: 'persistence',
        },
      ],
      inputVariables: [],
      nodes: [
        createGenfeedActionNode({
          actionId: PATTERN_EXTRACTION_ACTION_IDS.LOAD,
          id: 'load-checkpoints',
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: PATTERN_EXTRACTION_ACTION_IDS.SCAN_ADS,
          id: 'scan-ads',
          position: { x: 0, y: 200 },
        }),
        createGenfeedActionNode({
          actionId: PATTERN_EXTRACTION_ACTION_IDS.SCAN_CONTENT,
          id: 'scan-content',
          position: { x: 0, y: 400 },
        }),
        createGenfeedActionNode({
          actionId: PATTERN_EXTRACTION_ACTION_IDS.BUILD,
          id: 'build-patterns',
          position: { x: 0, y: 600 },
        }),
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'persist-patterns',
          parameters: {
            childWorkflowId: PATTERN_EXTRACTION_ITEM_WORKFLOW_ID,
            itemInputKey: 'item',
            maxConcurrency: 5,
            mode: 'await',
          },
          position: { x: 0, y: 800 },
        }),
        createGenfeedActionNode({
          actionId: PATTERN_EXTRACTION_ACTION_IDS.SAVE,
          id: 'save-checkpoints',
          position: { x: 0, y: 1000 },
        }),
      ],
    },
    description:
      'Extracts one organization’s private pattern candidates and anonymously promotes fingerprints shared by at least five organizations.',
    label: 'Extract Organization Creative Patterns',
    resultNodeId: 'save-checkpoints',
    version: 1,
  };
}

export function buildPatternCandidateWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: PATTERN_EXTRACTION_ITEM_WORKFLOW_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'item',
          label: 'Organization pattern candidate',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: PATTERN_EXTRACTION_ACTION_IDS.PERSIST,
          id: 'persist-candidate',
          inputVariableKeys: ['item'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description:
      'Persists one private candidate and atomically applies the five-organization public promotion invariant.',
    label: 'Persist Creative Pattern Candidate',
    resultNodeId: 'persist-candidate',
    version: 1,
  };
}
