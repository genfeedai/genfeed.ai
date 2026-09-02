import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const ARTICLE_HEADER_PROMPT_WORKFLOW_ID = 'article.header-prompt';

export const ARTICLE_HEADER_PROMPT_ACTION_IDS = {
  GENERATE: 'article.header-prompt.generate',
  LOAD: 'article.header-prompt.load',
  PERSIST: 'article.header-prompt.persist',
} as const;

export function buildArticleHeaderPromptWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: ARTICLE_HEADER_PROMPT_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'load-generate',
          source: 'load-article',
          target: 'generate-prompt',
          targetHandle: 'state',
        },
        {
          id: 'generate-persist',
          source: 'generate-prompt',
          target: 'persist-prompt',
          targetHandle: 'state',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Article header prompt request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: ARTICLE_HEADER_PROMPT_ACTION_IDS.LOAD,
          id: 'load-article',
          inputVariableKeys: ['request'],
        }),
        createGenfeedActionNode({
          actionId: ARTICLE_HEADER_PROMPT_ACTION_IDS.GENERATE,
          id: 'generate-prompt',
        }),
        createGenfeedActionNode({
          actionId: ARTICLE_HEADER_PROMPT_ACTION_IDS.PERSIST,
          id: 'persist-prompt',
        }),
      ],
    },
    description:
      'Loads one tenant article, generates its header-media prompt, and persists the prompt.',
    label: 'Generate Article Header Prompt',
    resultNodeId: 'persist-prompt',
    version: 1,
  };
}

export const ARTICLE_HEADER_PROMPT_WORKFLOW_DEFINITION =
  buildArticleHeaderPromptWorkflowDefinition();
