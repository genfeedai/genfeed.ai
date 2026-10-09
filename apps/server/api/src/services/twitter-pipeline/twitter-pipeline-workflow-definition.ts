import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';
import type { OrganizationModuleId } from '@genfeedai/contracts/constants';

export const TWITTER_PIPELINE_ACTION_IDS = {
  DRAFT_BUILD_PROMPT: 'twitter.pipeline.draft.build-prompt',
  DRAFT_GENERATE: 'twitter.pipeline.draft.generate',
  DRAFT_PARSE: 'twitter.pipeline.draft.parse',
  PUBLISH_RESOLVE_CREDENTIAL: 'twitter.pipeline.publish.resolve-credential',
  PUBLISH_SEND: 'twitter.pipeline.publish.send',
  SEARCH_RECENT: 'twitter.pipeline.search-recent',
} as const;

export const TWITTER_PIPELINE_WORKFLOW_IDS = {
  DRAFT: 'twitter.pipeline.draft',
  PUBLISH: 'twitter.pipeline.publish',
  SEARCH: 'twitter.pipeline.search',
} as const;

function requestActionNode(
  actionId: (typeof TWITTER_PIPELINE_ACTION_IDS)[keyof typeof TWITTER_PIPELINE_ACTION_IDS],
  id: string,
  y: number,
): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys: ['request'],
    position: { x: 0, y },
  });
}

function definition(
  canonicalId: string,
  organizationModule: OrganizationModuleId,
  label: string,
  description: string,
  nodes: WorkflowVisualNode[],
  edges: WorkflowEdge[],
  moduleCompletionNodeIds?: readonly string[],
): SystemWorkflowGraphDefinition {
  const resultNode = nodes.at(-1);
  if (!resultNode) {
    throw new Error(`${canonicalId} requires at least one action node`);
  }
  return {
    canonicalId,
    organizationModule,
    ...(moduleCompletionNodeIds ? { moduleCompletionNodeIds } : {}),
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: 'X pipeline request',
          required: true,
          type: 'json',
        },
      ],
      nodes,
    },
    description,
    label,
    resultNodeId: resultNode.id,
  };
}

export function buildTwitterSearchWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return definition(
    TWITTER_PIPELINE_WORKFLOW_IDS.SEARCH,
    'discovery',
    'Search X',
    'Searches recent X posts through the registered X search action.',
    [
      requestActionNode(
        TWITTER_PIPELINE_ACTION_IDS.SEARCH_RECENT,
        'search-recent',
        0,
      ),
    ],
    [],
  );
}

export function buildTwitterDraftWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const nodes = [
    requestActionNode(
      TWITTER_PIPELINE_ACTION_IDS.DRAFT_BUILD_PROMPT,
      'build-prompt',
      0,
    ),
    requestActionNode(
      TWITTER_PIPELINE_ACTION_IDS.DRAFT_GENERATE,
      'generate-drafts',
      160,
    ),
    requestActionNode(
      TWITTER_PIPELINE_ACTION_IDS.DRAFT_PARSE,
      'parse-drafts',
      320,
    ),
  ];
  return definition(
    TWITTER_PIPELINE_WORKFLOW_IDS.DRAFT,
    'discovery',
    'Draft X Opportunities',
    'Builds the X strategy prompt, generates draft text, and parses verified opportunities.',
    nodes,
    [
      {
        id: 'prompt-to-generation',
        source: 'build-prompt',
        target: 'generate-drafts',
        targetHandle: 'draftContext',
      },
      {
        id: 'prompt-to-parser',
        source: 'build-prompt',
        target: 'parse-drafts',
        targetHandle: 'draftContext',
      },
      {
        id: 'generation-to-parser',
        source: 'generate-drafts',
        target: 'parse-drafts',
        targetHandle: 'generation',
      },
    ],
    ['parse-drafts'],
  );
}

export function buildTwitterPublishWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const nodes = [
    requestActionNode(
      TWITTER_PIPELINE_ACTION_IDS.PUBLISH_RESOLVE_CREDENTIAL,
      'resolve-credential',
      0,
    ),
    requestActionNode(
      TWITTER_PIPELINE_ACTION_IDS.PUBLISH_SEND,
      'send-to-x',
      160,
    ),
  ];
  return definition(
    TWITTER_PIPELINE_WORKFLOW_IDS.PUBLISH,
    'publishing',
    'Publish to X',
    'Resolves the exact brand credential and executes one outbound X provider action.',
    nodes,
    [
      {
        id: 'credential-to-send',
        source: 'resolve-credential',
        target: 'send-to-x',
        targetHandle: 'credential',
      },
    ],
  );
}
