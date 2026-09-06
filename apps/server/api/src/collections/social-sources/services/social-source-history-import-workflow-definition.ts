import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const SOCIAL_SOURCE_HISTORY_IMPORT_ACTION_IDS = {
  RUN: 'social-source.history-import.run',
} as const;

export const SOCIAL_SOURCE_HISTORY_IMPORT_WORKFLOW_ID =
  'social-source.history-import';

export const SOCIAL_SOURCE_HISTORY_IMPORT_WORKFLOW_LABEL =
  'Social account history import';

export function buildSocialSourceHistoryImportWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: SOCIAL_SOURCE_HISTORY_IMPORT_WORKFLOW_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'request',
          label: 'History import request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: SOCIAL_SOURCE_HISTORY_IMPORT_ACTION_IDS.RUN,
          id: 'run-history-import',
          inputVariableKeys: ['request'],
        }),
      ],
    },
    description:
      "Imports a connected social account's existing posts into its own-account source.",
    label: SOCIAL_SOURCE_HISTORY_IMPORT_WORKFLOW_LABEL,
    resultNodeId: 'run-history-import',
    version: 1,
  };
}
