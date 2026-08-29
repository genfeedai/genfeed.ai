import type { ActionContractSchemas } from './action-contract.interface.js';
import {
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders.js';

const REQUEST = closedObjectSchema(
  {
    campaignId: STRING_SCHEMA,
    dispatchCursor: INTEGER_SCHEMA,
    organizationId: STRING_SCHEMA,
  },
  ['campaignId', 'dispatchCursor', 'organizationId'],
);
const STATE = closedObjectSchema(
  {
    action: enumSchema(['post_reply', 'send_dm'] as const),
    body: STRING_SCHEMA,
    claimStartedAt: STRING_SCHEMA,
    conversationId: STRING_SCHEMA,
    error: STRING_SCHEMA,
    errorKind: enumSchema(['bad-request', 'conflict', 'provider'] as const),
    externalMessageId: STRING_SCHEMA,
    externalUrl: STRING_SCHEMA,
    idempotencyKey: STRING_SCHEMA,
    messageId: STRING_SCHEMA,
    messageType: enumSchema(['dm', 'reply'] as const),
    organizationId: STRING_SCHEMA,
    outboundMessageId: STRING_SCHEMA,
    outcome: enumSchema([
      'campaign-completed',
      'campaign-inactive',
      'recipient-failed',
      'recipient-sent',
      'recipient-skipped',
      'throttled',
    ] as const),
    permanentError: BOOLEAN_SCHEMA,
    recipientId: STRING_SCHEMA,
    request: REQUEST,
    reservationClaimed: BOOLEAN_SCHEMA,
    scheduleDelaySeconds: NUMBER_SCHEMA,
    startedAt: STRING_SCHEMA,
    userId: STRING_SCHEMA,
    workflowRunId: STRING_SCHEMA,
  },
  ['request', 'startedAt'],
);
const RESULT = closedObjectSchema(
  {
    nextRunInSeconds: NUMBER_SCHEMA,
    outcome: enumSchema([
      'campaign-completed',
      'campaign-inactive',
      'recipient-failed',
      'recipient-sent',
      'recipient-skipped',
      'throttled',
    ] as const),
    recipientId: STRING_SCHEMA,
  },
  ['outcome'],
);
const stateInput = () =>
  closedObjectSchema({ request: REQUEST, state: STATE }, ['request', 'state']);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'social.reply-campaign.claim': {
    inputSchema: stateInput(),
    outputSchema: STATE,
  },
  'social.reply-campaign.finalize': {
    inputSchema: stateInput(),
    outputSchema: RESULT,
  },
  'social.reply-campaign.load': {
    inputSchema: closedObjectSchema({ request: REQUEST }, ['request']),
    outputSchema: STATE,
  },
  'social.reply-campaign.prepare': {
    inputSchema: stateInput(),
    outputSchema: STATE,
  },
  'social.reply-campaign.reclaim': {
    inputSchema: stateInput(),
    outputSchema: STATE,
  },
  'social.reply-campaign.throttle': {
    inputSchema: stateInput(),
    outputSchema: STATE,
  },
};

export function getSocialReplyCampaignActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
