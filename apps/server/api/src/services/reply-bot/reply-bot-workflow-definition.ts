import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const REPLY_BOT_ACTION_IDS = {
  CLAIM_CONTENT: 'reply-bot.content.claim',
  DISCOVER_BOTS: 'reply-bot.organization.discover-bots',
  FETCH_CANDIDATES: 'reply-bot.bot.fetch-candidates',
  FINALIZE_BOT: 'reply-bot.bot.finalize',
  FINALIZE_CONTENT: 'reply-bot.content.finalize',
  FINALIZE_DM: 'reply-bot.dm.finalize',
  FINALIZE_ORGANIZATION: 'reply-bot.organization.finalize',
  FINALIZE_TEST: 'reply-bot.test.finalize',
  GENERATE_DM: 'reply-bot.content.generate-dm',
  GENERATE_REPLY: 'reply-bot.content.generate-reply',
  SEND_DM: 'reply-bot.dm.send',
  SEND_REPLY: 'reply-bot.content.send-reply',
  LOAD_TEST: 'reply-bot.test.load',
} as const;

export const REPLY_BOT_WORKFLOW_IDS = {
  ORGANIZATION: 'reply-bot.process-organization',
  TEST: 'reply-bot.test-generation',
  BOT: 'reply-bot.process-bot',
  CONTENT: 'reply-bot.process-content',
  DM: 'reply-bot.send-dm',
} as const;

type ReplyBotActionId =
  (typeof REPLY_BOT_ACTION_IDS)[keyof typeof REPLY_BOT_ACTION_IDS];

function actionNode(
  actionId: ReplyBotActionId,
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
  label: string,
  description: string,
  nodes: WorkflowVisualNode[],
  edges: WorkflowEdge[],
  resultNodeId: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: `${label} request`,
          required: true,
          type: 'json',
        },
      ],
      nodes,
    },
    description,
    label,
    resultNodeId,
  };
}

export function buildReplyBotOrganizationWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const discover = actionNode(
    REPLY_BOT_ACTION_IDS.DISCOVER_BOTS,
    'discover-bots',
    0,
  );
  const fanOut = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'process-bots',
    inputVariableKeys: ['request'],
    parameters: {
      childWorkflowId: REPLY_BOT_WORKFLOW_IDS.BOT,
      itemInputKey: 'request',
      maxConcurrency: 4,
      mode: 'await',
    },
    position: { x: 0, y: 160 },
  });
  const finalize = actionNode(
    REPLY_BOT_ACTION_IDS.FINALIZE_ORGANIZATION,
    'finalize-organization',
    320,
  );
  return definition(
    REPLY_BOT_WORKFLOW_IDS.ORGANIZATION,
    'Process Reply Bots',
    'Discovers active reply bots, executes one child workflow per bot, and aggregates their results.',
    [discover, fanOut, finalize],
    [
      {
        id: 'bots-to-fan-out',
        source: discover.id,
        sourceHandle: 'items',
        target: fanOut.id,
        targetHandle: 'items',
      },
      {
        id: 'bot-results-to-finalize',
        source: fanOut.id,
        target: finalize.id,
        targetHandle: 'batch',
      },
    ],
    finalize.id,
  );
}

export function buildReplyBotWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const fetch = actionNode(
    REPLY_BOT_ACTION_IDS.FETCH_CANDIDATES,
    'fetch-candidates',
    0,
  );
  const fanOut = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'process-candidates',
    inputVariableKeys: ['request'],
    parameters: {
      childWorkflowId: REPLY_BOT_WORKFLOW_IDS.CONTENT,
      itemInputKey: 'request',
      maxConcurrency: 4,
      mode: 'await',
    },
    position: { x: 0, y: 160 },
  });
  const finalize = actionNode(
    REPLY_BOT_ACTION_IDS.FINALIZE_BOT,
    'finalize-bot',
    320,
  );
  return definition(
    REPLY_BOT_WORKFLOW_IDS.BOT,
    'Process Reply Bot',
    'Fetches and prefilters candidates, executes one child workflow per candidate, and aggregates the bot result.',
    [fetch, fanOut, finalize],
    [
      {
        id: 'candidates-to-fan-out',
        source: fetch.id,
        sourceHandle: 'items',
        target: fanOut.id,
        targetHandle: 'items',
      },
      {
        id: 'fetch-state-to-finalize',
        source: fetch.id,
        target: finalize.id,
        targetHandle: 'state',
      },
      {
        id: 'candidate-results-to-finalize',
        source: fanOut.id,
        target: finalize.id,
        targetHandle: 'batch',
      },
    ],
    finalize.id,
  );
}

export function buildReplyBotContentWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const sequence = [
    ['claim-content', REPLY_BOT_ACTION_IDS.CLAIM_CONTENT],
    ['generate-reply', REPLY_BOT_ACTION_IDS.GENERATE_REPLY],
    ['generate-dm', REPLY_BOT_ACTION_IDS.GENERATE_DM],
    ['send-reply', REPLY_BOT_ACTION_IDS.SEND_REPLY],
  ] as const;
  const nodes = sequence.map(([id, actionId], index) =>
    actionNode(actionId, id, index * 160),
  );
  const sendReply = nodes.at(-1);
  if (!sendReply) throw new Error('Reply bot content workflow requires send');
  const scheduleDm = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'schedule-dm',
    inputVariableKeys: ['request'],
    parameters: {
      childWorkflowId: REPLY_BOT_WORKFLOW_IDS.DM,
      itemInputKey: 'request',
      maxConcurrency: 1,
      mode: 'scheduled',
    },
    position: { x: 0, y: 640 },
  });
  const finalize = actionNode(
    REPLY_BOT_ACTION_IDS.FINALIZE_CONTENT,
    'finalize-content',
    800,
  );
  const edges: WorkflowEdge[] = sequence.slice(1).map(([id], index) => ({
    id: `${sequence[index]?.[0]}-to-${id}`,
    source: sequence[index]?.[0] ?? '',
    target: id,
    targetHandle: 'state',
  }));
  edges.push(
    {
      id: 'dm-items-to-schedule',
      source: sendReply.id,
      sourceHandle: 'dmItems',
      target: scheduleDm.id,
      targetHandle: 'items',
    },
    {
      id: 'dm-delay-to-schedule',
      source: sendReply.id,
      sourceHandle: 'dmDelayMs',
      target: scheduleDm.id,
      targetHandle: 'initialDelayMs',
    },
    {
      id: 'content-state-to-finalize',
      source: sendReply.id,
      target: finalize.id,
      targetHandle: 'state',
    },
    {
      id: 'dm-dispatch-to-finalize',
      source: scheduleDm.id,
      target: finalize.id,
      targetHandle: 'dmDispatch',
    },
  );
  return definition(
    REPLY_BOT_WORKFLOW_IDS.CONTENT,
    'Process Reply Candidate',
    'Claims one candidate, generates text, publishes the reply, durably schedules an optional DM, and finalizes activity state.',
    [...nodes, scheduleDm, finalize],
    edges,
    finalize.id,
  );
}

export function buildReplyBotDmWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const send = actionNode(REPLY_BOT_ACTION_IDS.SEND_DM, 'send-dm', 0);
  const finalize = actionNode(
    REPLY_BOT_ACTION_IDS.FINALIZE_DM,
    'finalize-dm',
    160,
  );
  return definition(
    REPLY_BOT_WORKFLOW_IDS.DM,
    'Send Reply Bot DM',
    'Loads the credential at execution time, sends one DM, and owns final activity status.',
    [send, finalize],
    [
      {
        id: 'send-to-finalize',
        source: send.id,
        target: finalize.id,
        targetHandle: 'state',
      },
    ],
    finalize.id,
  );
}

export function buildReplyBotTestWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const sequence = [
    ['load-test', REPLY_BOT_ACTION_IDS.LOAD_TEST],
    ['generate-reply', REPLY_BOT_ACTION_IDS.GENERATE_REPLY],
    ['generate-dm', REPLY_BOT_ACTION_IDS.GENERATE_DM],
    ['finalize-test', REPLY_BOT_ACTION_IDS.FINALIZE_TEST],
  ] as const;
  const nodes = sequence.map(([id, actionId], index) =>
    actionNode(actionId, id, index * 160),
  );
  const edges: WorkflowEdge[] = sequence.slice(1).map(([id], index) => ({
    id: `${sequence[index]?.[0]}-to-${id}`,
    source: sequence[index]?.[0] ?? '',
    target: id,
    targetHandle: 'state',
  }));
  return definition(
    REPLY_BOT_WORKFLOW_IDS.TEST,
    'Test Reply Generation',
    'Loads one bot configuration, generates reply and optional DM copy, and returns the dry-run result without publishing.',
    nodes,
    edges,
    'finalize-test',
  );
}
