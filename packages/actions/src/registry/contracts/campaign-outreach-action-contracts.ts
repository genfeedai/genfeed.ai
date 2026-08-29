import type { ActionContractSchemas } from './action-contract.interface.js';
import {
  arraySchema,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders.js';

const TRUE_SCHEMA = { const: true, type: 'boolean' } as const;
const FALSE_SCHEMA = { const: false, type: 'boolean' } as const;
const SKIP_REASON = enumSchema([
  'already_replied',
  'blocked_author',
  'campaign_paused',
  'content_too_old',
  'dm_not_allowed',
  'high_engagement',
  'low_engagement',
  'low_relevance',
  'manual_skip',
  'rate_limited',
  'user_not_found',
] as const);
const TARGET_REQUEST = closedObjectSchema(
  {
    campaignId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    targetId: STRING_SCHEMA,
  },
  ['campaignId', 'organizationId', 'targetId'],
);
const DISCOVERY_REQUEST = closedObjectSchema(
  {
    campaignId: STRING_SCHEMA,
    limit: NUMBER_SCHEMA,
    organizationId: STRING_SCHEMA,
  },
  ['campaignId', 'organizationId'],
);
const TARGET_ITEM = closedObjectSchema(
  {
    campaignId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    targetId: STRING_SCHEMA,
  },
  ['campaignId', 'organizationId', 'targetId'],
);
const DISCOVERY = closedObjectSchema(
  { interItemDelayMs: NUMBER_SCHEMA, items: arraySchema(TARGET_ITEM) },
  ['interItemDelayMs', 'items'],
);
const FAILURE_OUTCOME = {
  oneOf: [
    closedObjectSchema(
      { error: STRING_SCHEMA, skipReason: SKIP_REASON, success: FALSE_SCHEMA },
      ['error', 'success'],
    ),
    closedObjectSchema({ skipReason: SKIP_REASON, success: FALSE_SCHEMA }, [
      'skipReason',
      'success',
    ]),
  ],
} as const;
const REPLY_RESULT = {
  oneOf: [
    closedObjectSchema(
      {
        replyExternalId: STRING_SCHEMA,
        replyText: STRING_SCHEMA,
        replyUrl: STRING_SCHEMA,
        success: TRUE_SCHEMA,
      },
      ['replyText', 'success'],
    ),
    ...FAILURE_OUTCOME.oneOf,
  ],
} as const;
const DM_RESULT = {
  oneOf: [
    closedObjectSchema({ success: TRUE_SCHEMA }, ['success']),
    ...FAILURE_OUTCOME.oneOf,
  ],
} as const;
const REPLY_STATE = closedObjectSchema(
  {
    campaignId: STRING_SCHEMA,
    credentialId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    outcome: REPLY_RESULT,
    replyText: STRING_SCHEMA,
    sendResult: closedObjectSchema(
      {
        error: STRING_SCHEMA,
        success: { type: 'boolean' },
        tweetId: STRING_SCHEMA,
        tweetUrl: STRING_SCHEMA,
      },
      ['success'],
    ),
    targetId: STRING_SCHEMA,
  },
  ['campaignId', 'organizationId', 'targetId'],
);
const DM_STATE = closedObjectSchema(
  {
    campaignId: STRING_SCHEMA,
    credentialId: STRING_SCHEMA,
    dmText: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    outcome: DM_RESULT,
    recipientUserId: STRING_SCHEMA,
    sendResult: closedObjectSchema(
      { error: STRING_SCHEMA, success: { type: 'boolean' } },
      ['success'],
    ),
    targetId: STRING_SCHEMA,
  },
  ['campaignId', 'organizationId', 'targetId'],
);
const replyStateInput = closedObjectSchema(
  { request: TARGET_REQUEST, state: REPLY_STATE },
  ['request', 'state'],
);
const dmStateInput = closedObjectSchema(
  { request: TARGET_REQUEST, state: DM_STATE },
  ['request', 'state'],
);
const DISPATCH_ITEM = closedObjectSchema(
  {
    campaignId: STRING_SCHEMA,
    limit: NUMBER_SCHEMA,
    organizationId: STRING_SCHEMA,
  },
  ['campaignId', 'limit', 'organizationId'],
);
const DISPATCH_DISCOVERY = closedObjectSchema(
  {
    dmItems: arraySchema(DISPATCH_ITEM),
    organizationId: STRING_SCHEMA,
    replyItems: arraySchema(DISPATCH_ITEM),
    skipped: NUMBER_SCHEMA,
    total: NUMBER_SCHEMA,
  },
  ['dmItems', 'organizationId', 'replyItems', 'skipped', 'total'],
);
const SCHEDULED_BATCH = closedObjectSchema(
  {
    count: INTEGER_SCHEMA,
    results: arraySchema(
      closedObjectSchema({ index: INTEGER_SCHEMA, jobId: STRING_SCHEMA }, [
        'index',
        'jobId',
      ]),
    ),
  },
  ['count', 'results'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'campaign.dispatch.discover': {
    inputSchema: closedObjectSchema({
      request: closedObjectSchema({ organizationId: STRING_SCHEMA }),
    }),
    outputSchema: DISPATCH_DISCOVERY,
  },
  'campaign.dispatch.finalize': {
    inputSchema: closedObjectSchema(
      {
        dmBatch: SCHEDULED_BATCH,
        replyBatch: SCHEDULED_BATCH,
        request: closedObjectSchema({ organizationId: STRING_SCHEMA }),
        state: DISPATCH_DISCOVERY,
      },
      ['dmBatch', 'replyBatch', 'state'],
    ),
    outputSchema: closedObjectSchema(
      {
        action: enumSchema(['campaign.dispatch.active'] as const),
        alreadyQueued: NUMBER_SCHEMA,
        enqueued: NUMBER_SCHEMA,
        failed: NUMBER_SCHEMA,
        organizationId: STRING_SCHEMA,
        reason: enumSchema(['no_active_campaigns'] as const),
        skipped: NUMBER_SCHEMA,
        status: enumSchema(['completed', 'failed', 'skipped'] as const),
      },
      [
        'action',
        'alreadyQueued',
        'enqueued',
        'failed',
        'organizationId',
        'skipped',
        'status',
      ],
    ),
  },
  'campaign.dm.claim': {
    inputSchema: closedObjectSchema({ request: TARGET_REQUEST }, ['request']),
    outputSchema: DM_STATE,
  },
  'campaign.dm.discover-targets': {
    inputSchema: closedObjectSchema({ request: DISCOVERY_REQUEST }, [
      'request',
    ]),
    outputSchema: DISCOVERY,
  },
  'campaign.dm.finalize': {
    inputSchema: dmStateInput,
    outputSchema: DM_RESULT,
  },
  'campaign.dm.generate': { inputSchema: dmStateInput, outputSchema: DM_STATE },
  'campaign.dm.reserve': { inputSchema: dmStateInput, outputSchema: DM_STATE },
  'campaign.dm.resolve-context': {
    inputSchema: dmStateInput,
    outputSchema: DM_STATE,
  },
  'campaign.dm.send': { inputSchema: dmStateInput, outputSchema: DM_STATE },
  'campaign.reply.claim': {
    inputSchema: closedObjectSchema({ request: TARGET_REQUEST }, ['request']),
    outputSchema: REPLY_STATE,
  },
  'campaign.reply.discover-targets': {
    inputSchema: closedObjectSchema({ request: DISCOVERY_REQUEST }, [
      'request',
    ]),
    outputSchema: DISCOVERY,
  },
  'campaign.reply.finalize': {
    inputSchema: replyStateInput,
    outputSchema: REPLY_RESULT,
  },
  'campaign.reply.generate': {
    inputSchema: replyStateInput,
    outputSchema: REPLY_STATE,
  },
  'campaign.reply.load-context': {
    inputSchema: replyStateInput,
    outputSchema: REPLY_STATE,
  },
  'campaign.reply.preview.generate': {
    inputSchema: replyStateInput,
    outputSchema: STRING_SCHEMA,
  },
  'campaign.reply.preview.validate': {
    inputSchema: closedObjectSchema({ request: TARGET_REQUEST }, ['request']),
    outputSchema: REPLY_STATE,
  },
  'campaign.reply.reserve': {
    inputSchema: replyStateInput,
    outputSchema: REPLY_STATE,
  },
  'campaign.reply.send': {
    inputSchema: replyStateInput,
    outputSchema: REPLY_STATE,
  },
};

export function getCampaignOutreachActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
