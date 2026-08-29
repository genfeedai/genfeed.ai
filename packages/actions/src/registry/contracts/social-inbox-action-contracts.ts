import type { ActionJsonSchema } from '../../interfaces/action-definition.interface';
import type { ActionContractSchemas } from './action-contract.interface';
import {
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const OUTBOUND_PROPERTIES = {
  body: STRING_SCHEMA,
  conversationId: STRING_SCHEMA,
  error: STRING_SCHEMA,
  errorKind: enumSchema(['bad-request', 'conflict', 'provider'] as const),
  externalMessageId: STRING_SCHEMA,
  externalUrl: STRING_SCHEMA,
  idempotencyKey: STRING_SCHEMA,
  organizationId: STRING_SCHEMA,
  outboundMessageId: STRING_SCHEMA,
  recipientId: STRING_SCHEMA,
  reservationClaimed: { type: 'boolean' },
  userId: STRING_SCHEMA,
  workflowRunId: STRING_SCHEMA,
} as const;
const CAMPAIGN_REQUEST = closedObjectSchema(
  {
    campaignId: STRING_SCHEMA,
    dispatchCursor: INTEGER_SCHEMA,
    organizationId: STRING_SCHEMA,
  },
  ['campaignId', 'dispatchCursor', 'organizationId'],
);
const CAMPAIGN_PROPERTIES = {
  ...OUTBOUND_PROPERTIES,
  claimStartedAt: STRING_SCHEMA,
  messageId: STRING_SCHEMA,
  outcome: enumSchema([
    'campaign-completed',
    'campaign-inactive',
    'recipient-failed',
    'recipient-sent',
    'recipient-skipped',
    'throttled',
  ] as const),
  permanentError: { type: 'boolean' },
  request: CAMPAIGN_REQUEST,
  scheduleDelaySeconds: NUMBER_SCHEMA,
  startedAt: STRING_SCHEMA,
} as const;
const outboundBranch = (
  action: 'post_reply' | 'send_dm',
  messageType: 'dm' | 'reply',
) =>
  closedObjectSchema(
    {
      ...OUTBOUND_PROPERTIES,
      action: enumSchema([action] as const),
      messageType: enumSchema([messageType] as const),
    },
    ['action', 'body', 'conversationId', 'messageType', 'organizationId'],
  );
const OUTBOUND_STATE: ActionJsonSchema = {
  oneOf: [
    outboundBranch('post_reply', 'reply'),
    outboundBranch('send_dm', 'dm'),
    closedObjectSchema(CAMPAIGN_PROPERTIES, [
      'outcome',
      'request',
      'startedAt',
    ]),
    closedObjectSchema(
      {
        ...CAMPAIGN_PROPERTIES,
        action: enumSchema(['post_reply'] as const),
        messageType: enumSchema(['reply'] as const),
      },
      [
        'action',
        'body',
        'conversationId',
        'messageType',
        'organizationId',
        'request',
        'startedAt',
      ],
    ),
    closedObjectSchema(
      {
        ...CAMPAIGN_PROPERTIES,
        action: enumSchema(['send_dm'] as const),
        messageType: enumSchema(['dm'] as const),
      },
      [
        'action',
        'body',
        'conversationId',
        'messageType',
        'organizationId',
        'request',
        'startedAt',
      ],
    ),
  ],
};
const outboundStateInput: ActionJsonSchema = {
  oneOf: [
    closedObjectSchema({ request: OUTBOUND_STATE, state: OUTBOUND_STATE }, [
      'request',
      'state',
    ]),
    closedObjectSchema({ request: CAMPAIGN_REQUEST, state: OUTBOUND_STATE }, [
      'request',
      'state',
    ]),
  ],
};

const SYNC_INPUT = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    conversationType: enumSchema(['comment', 'dm'] as const),
    credentialId: STRING_SCHEMA,
    limit: NUMBER_SCHEMA,
    organizationId: STRING_SCHEMA,
    platform: enumSchema([
      'instagram',
      'linkedin',
      'twitter',
      'youtube',
    ] as const),
    userId: STRING_SCHEMA,
  },
  ['organizationId'],
);
const VALIDATED_SYNC = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    conversationType: enumSchema(['comment', 'dm'] as const),
    credentialId: STRING_SCHEMA,
    limit: NUMBER_SCHEMA,
    organizationId: STRING_SCHEMA,
    platform: enumSchema([
      'instagram',
      'linkedin',
      'twitter',
      'youtube',
    ] as const),
    userId: STRING_SCHEMA,
  },
  ['conversationType', 'organizationId', 'platform'],
);
const SYNC_RESULT = closedObjectSchema(
  { conversationsCreated: INTEGER_SCHEMA, messagesCreated: INTEGER_SCHEMA },
  ['conversationsCreated', 'messagesCreated'],
);
const syncContract = (
  platform: 'instagram' | 'linkedin' | 'twitter' | 'youtube',
  conversationType: 'comment' | 'dm',
): ActionContractSchemas => ({
  inputSchema: closedObjectSchema(
    {
      request: SYNC_INPUT,
      state: closedObjectSchema(
        {
          brandId: STRING_SCHEMA,
          conversationType: enumSchema([conversationType] as const),
          credentialId: STRING_SCHEMA,
          limit: NUMBER_SCHEMA,
          organizationId: STRING_SCHEMA,
          platform: enumSchema([platform] as const),
          userId: STRING_SCHEMA,
        },
        ['conversationType', 'organizationId', 'platform'],
      ),
    },
    ['request', 'state'],
  ),
  outputSchema: SYNC_RESULT,
});

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'social.inbox.outbound.finalize': {
    inputSchema: outboundStateInput,
    outputSchema: OUTBOUND_STATE,
  },
  'social.inbox.outbound.provider': {
    inputSchema: outboundStateInput,
    outputSchema: OUTBOUND_STATE,
  },
  'social.inbox.outbound.reserve': {
    inputSchema: {
      oneOf: [
        closedObjectSchema({ request: OUTBOUND_STATE }, ['request']),
        closedObjectSchema(
          { request: CAMPAIGN_REQUEST, state: OUTBOUND_STATE },
          ['request', 'state'],
        ),
      ],
    },
    outputSchema: OUTBOUND_STATE,
  },
  'social.inbox.sync.instagram-comments': syncContract('instagram', 'comment'),
  'social.inbox.sync.instagram-dms': syncContract('instagram', 'dm'),
  'social.inbox.sync.linkedin-comments': syncContract('linkedin', 'comment'),
  'social.inbox.sync.linkedin-dms': syncContract('linkedin', 'dm'),
  'social.inbox.sync.validate': {
    inputSchema: closedObjectSchema({ request: SYNC_INPUT }, ['request']),
    outputSchema: VALIDATED_SYNC,
  },
  'social.inbox.sync.x-comments': syncContract('twitter', 'comment'),
  'social.inbox.sync.x-dms': syncContract('twitter', 'dm'),
  'social.inbox.sync.youtube-comments': syncContract('youtube', 'comment'),
};

export function getSocialInboxActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
