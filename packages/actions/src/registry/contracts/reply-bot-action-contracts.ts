import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const BOT_REQUEST = closedObjectSchema(
  {
    botConfigId: STRING_SCHEMA,
    credentialId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
  },
  ['botConfigId', 'credentialId', 'organizationId'],
);
const ORGANIZATION_REQUEST = closedObjectSchema(
  { credentialId: STRING_SCHEMA, organizationId: STRING_SCHEMA },
  ['credentialId', 'organizationId'],
);
const CONTENT_REQUEST = closedObjectSchema(
  {
    botConfigId: STRING_SCHEMA,
    content: JSON_DOCUMENT_SCHEMA,
    credentialId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
  },
  ['botConfigId', 'content', 'credentialId', 'organizationId'],
);
const DM_REQUEST_PROPERTIES = {
  activityId: STRING_SCHEMA,
  botConfigId: STRING_SCHEMA,
  credentialId: STRING_SCHEMA,
  dmText: STRING_SCHEMA,
  organizationId: STRING_SCHEMA,
  recipientId: STRING_SCHEMA,
  replyContentId: STRING_SCHEMA,
  replyContentUrl: STRING_SCHEMA,
  replyText: STRING_SCHEMA,
} as const;
const DM_REQUEST_REQUIRED = [
  'activityId',
  'botConfigId',
  'credentialId',
  'dmText',
  'organizationId',
  'recipientId',
] as const;
const DM_REQUEST = closedObjectSchema(
  DM_REQUEST_PROPERTIES,
  DM_REQUEST_REQUIRED,
);
const DM_STATE = closedObjectSchema(
  {
    ...DM_REQUEST_PROPERTIES,
    dmContentId: STRING_SCHEMA,
    error: STRING_SCHEMA,
    success: BOOLEAN_SCHEMA,
  },
  [...DM_REQUEST_REQUIRED, 'success'],
);
const CONTENT_STATE_PROPERTIES = {
  activityId: STRING_SCHEMA,
  botConfigId: STRING_SCHEMA,
  content: JSON_DOCUMENT_SCHEMA,
  credentialId: STRING_SCHEMA,
  dmDelayMs: NUMBER_SCHEMA,
  dmItems: arraySchema(DM_REQUEST),
  dmText: STRING_SCHEMA,
  error: STRING_SCHEMA,
  intent: STRING_SCHEMA,
  organizationId: STRING_SCHEMA,
  replyContentId: STRING_SCHEMA,
  replyContentUrl: STRING_SCHEMA,
  replySent: BOOLEAN_SCHEMA,
  replyText: STRING_SCHEMA,
  skipReason: STRING_SCHEMA,
  skipped: BOOLEAN_SCHEMA,
  test: BOOLEAN_SCHEMA,
} as const;
const CONTENT_STATE_REQUIRED = [
  'botConfigId',
  'content',
  'credentialId',
  'dmDelayMs',
  'dmItems',
  'organizationId',
  'replySent',
  'skipped',
] as const;
const CONTENT_STATE = closedObjectSchema(
  CONTENT_STATE_PROPERTIES,
  CONTENT_STATE_REQUIRED,
);
const PROCESSING_RESULT = closedObjectSchema(
  {
    botConfigId: STRING_SCHEMA,
    contentProcessed: INTEGER_SCHEMA,
    dmsSent: INTEGER_SCHEMA,
    errors: INTEGER_SCHEMA,
    platform: STRING_SCHEMA,
    repliesSent: INTEGER_SCHEMA,
    skipped: INTEGER_SCHEMA,
  },
  [
    'botConfigId',
    'contentProcessed',
    'dmsSent',
    'errors',
    'platform',
    'repliesSent',
    'skipped',
  ],
);
const CONTENT_RESULT = closedObjectSchema(
  {
    dmSent: BOOLEAN_SCHEMA,
    error: BOOLEAN_SCHEMA,
    replySent: BOOLEAN_SCHEMA,
    skipped: BOOLEAN_SCHEMA,
  },
  ['dmSent', 'replySent', 'skipped'],
);
const TEST_REQUEST = closedObjectSchema(
  {
    botConfigId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    testContent: closedObjectSchema(
      { author: STRING_SCHEMA, content: STRING_SCHEMA },
      ['author', 'content'],
    ),
  },
  ['botConfigId', 'organizationId', 'testContent'],
);
const CONTENT_OR_TEST_REQUEST = { oneOf: [CONTENT_REQUEST, TEST_REQUEST] };

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'reply-bot.bot.fetch-candidates': {
    inputSchema: closedObjectSchema({ request: BOT_REQUEST }, ['request']),
    outputSchema: closedObjectSchema(
      {
        botConfigId: STRING_SCHEMA,
        fetchError: STRING_SCHEMA,
        items: arraySchema(CONTENT_REQUEST),
        platform: STRING_SCHEMA,
        skipped: INTEGER_SCHEMA,
      },
      ['botConfigId', 'items', 'platform', 'skipped'],
    ),
  },
  'reply-bot.bot.finalize': {
    inputSchema: closedObjectSchema(
      {
        batch: JSON_DOCUMENT_SCHEMA,
        request: BOT_REQUEST,
        state: JSON_DOCUMENT_SCHEMA,
      },
      ['batch', 'request', 'state'],
    ),
    outputSchema: PROCESSING_RESULT,
  },
  'reply-bot.content.claim': {
    inputSchema: closedObjectSchema({ request: CONTENT_REQUEST }, ['request']),
    outputSchema: CONTENT_STATE,
  },
  'reply-bot.content.finalize': {
    inputSchema: closedObjectSchema(
      {
        dmDispatch: JSON_DOCUMENT_SCHEMA,
        request: CONTENT_REQUEST,
        state: CONTENT_STATE,
      },
      ['dmDispatch', 'request', 'state'],
    ),
    outputSchema: CONTENT_RESULT,
  },
  'reply-bot.content.generate-dm': {
    inputSchema: closedObjectSchema(
      { request: CONTENT_OR_TEST_REQUEST, state: CONTENT_STATE },
      ['request', 'state'],
    ),
    outputSchema: CONTENT_STATE,
  },
  'reply-bot.content.generate-reply': {
    inputSchema: closedObjectSchema(
      { request: CONTENT_OR_TEST_REQUEST, state: CONTENT_STATE },
      ['request', 'state'],
    ),
    outputSchema: CONTENT_STATE,
  },
  'reply-bot.content.send-reply': {
    inputSchema: closedObjectSchema(
      { request: CONTENT_REQUEST, state: CONTENT_STATE },
      ['request', 'state'],
    ),
    outputSchema: CONTENT_STATE,
  },
  'reply-bot.dm.finalize': {
    inputSchema: closedObjectSchema({ request: DM_REQUEST, state: DM_STATE }, [
      'request',
      'state',
    ]),
    outputSchema: DM_STATE,
  },
  'reply-bot.dm.send': {
    inputSchema: closedObjectSchema({ request: DM_REQUEST }, ['request']),
    outputSchema: DM_STATE,
  },
  'reply-bot.organization.discover-bots': {
    inputSchema: closedObjectSchema({ request: ORGANIZATION_REQUEST }, [
      'request',
    ]),
    outputSchema: closedObjectSchema({ items: arraySchema(BOT_REQUEST) }, [
      'items',
    ]),
  },
  'reply-bot.organization.finalize': {
    inputSchema: closedObjectSchema(
      { batch: JSON_DOCUMENT_SCHEMA, request: ORGANIZATION_REQUEST },
      ['batch', 'request'],
    ),
    outputSchema: arraySchema(PROCESSING_RESULT),
  },
  'reply-bot.test.finalize': {
    inputSchema: closedObjectSchema(
      { request: TEST_REQUEST, state: CONTENT_STATE },
      ['request', 'state'],
    ),
    outputSchema: closedObjectSchema(
      { dmText: STRING_SCHEMA, replyText: STRING_SCHEMA },
      ['replyText'],
    ),
  },
  'reply-bot.test.load': {
    inputSchema: closedObjectSchema({ request: TEST_REQUEST }, ['request']),
    outputSchema: CONTENT_STATE,
  },
};

export function getReplyBotActionContract(
  actionId: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[actionId];
}
