import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const AUTHOR_REPLY_ACTION_IDS = {
  FINALIZE_DRAFT: 'author-reply.finalize-draft',
  FINALIZE_SEND: 'author-reply.finalize-send',
  GENERATE_DRAFT: 'author-reply.generate-draft',
  RESOLVE_CREDENTIAL: 'author-reply.resolve-credential',
  RESOLVE_INTENT: 'author-reply.resolve-intent',
  SEND: 'author-reply.send',
} as const;

export const AUTHOR_REPLY_WORKFLOW_IDS = {
  DRAFT: 'author-reply.draft',
  SEND: 'author-reply.send-reply',
} as const;

function actionNode(
  actionId: (typeof AUTHOR_REPLY_ACTION_IDS)[keyof typeof AUTHOR_REPLY_ACTION_IDS],
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

function buildDefinition(
  canonicalId: string,
  label: string,
  description: string,
  sequence: readonly (readonly [
    string,
    (typeof AUTHOR_REPLY_ACTION_IDS)[keyof typeof AUTHOR_REPLY_ACTION_IDS],
  ])[],
): SystemWorkflowGraphDefinition {
  const nodes = sequence.map(([id, actionId], index) =>
    actionNode(actionId, id, index * 160),
  );
  const edges: WorkflowEdge[] = sequence.slice(1).map(([id], index) => ({
    id: `${sequence[index]?.[0]}-to-${id}`,
    source: sequence[index]?.[0] ?? '',
    target: id,
    targetHandle: 'state',
  }));
  const resultNode = nodes.at(-1);
  if (!resultNode) throw new Error(`${canonicalId} requires action nodes`);
  return {
    canonicalId,
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: 'Author reply request',
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

export function buildAuthorReplyDraftWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return buildDefinition(
    AUTHOR_REPLY_WORKFLOW_IDS.DRAFT,
    'Draft Author Reply',
    'Resolves reply intent, generates the response, and returns the typed draft.',
    [
      ['resolve-intent', AUTHOR_REPLY_ACTION_IDS.RESOLVE_INTENT],
      ['generate-draft', AUTHOR_REPLY_ACTION_IDS.GENERATE_DRAFT],
      ['finalize-draft', AUTHOR_REPLY_ACTION_IDS.FINALIZE_DRAFT],
    ],
  );
}

export function buildAuthorReplySendWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return buildDefinition(
    AUTHOR_REPLY_WORKFLOW_IDS.SEND,
    'Send Author Reply',
    'Resolves intent and account, prepares text, performs one provider send, and records the closed loop.',
    [
      ['resolve-intent', AUTHOR_REPLY_ACTION_IDS.RESOLVE_INTENT],
      ['resolve-credential', AUTHOR_REPLY_ACTION_IDS.RESOLVE_CREDENTIAL],
      ['generate-draft', AUTHOR_REPLY_ACTION_IDS.GENERATE_DRAFT],
      ['send-reply', AUTHOR_REPLY_ACTION_IDS.SEND],
      ['finalize-send', AUTHOR_REPLY_ACTION_IDS.FINALIZE_SEND],
    ],
  );
}
