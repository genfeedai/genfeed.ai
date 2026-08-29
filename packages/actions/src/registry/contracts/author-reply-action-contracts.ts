import type { ActionContractSchemas } from './action-contract.interface.js';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders.js';

const REPLY_INTENT = enumSchema([
  'default',
  'question',
  'spam',
  'thanks',
  'troll',
] as const);
const PLATFORM = enumSchema(['twitter', 'youtube'] as const);
const AUTHOR_REQUEST = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    commentAuthor: STRING_SCHEMA,
    commentAuthorId: STRING_SCHEMA,
    commentId: STRING_SCHEMA,
    commentText: STRING_SCHEMA,
    intent: REPLY_INTENT,
    organizationId: STRING_SCHEMA,
    parentPostId: STRING_SCHEMA,
    parentPostPreview: STRING_SCHEMA,
    platform: PLATFORM,
    replyText: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  [
    'brandId',
    'commentAuthor',
    'commentId',
    'commentText',
    'organizationId',
    'userId',
  ],
);
const AUTHOR_STATE_PROPERTIES = {
  intent: REPLY_INTENT,
  intentLabel: STRING_SCHEMA,
  platform: PLATFORM,
  request: AUTHOR_REQUEST,
} as const;
const AUTHOR_STATE = closedObjectSchema(AUTHOR_STATE_PROPERTIES, [
  'intent',
  'intentLabel',
  'platform',
  'request',
]);
const CREDENTIAL_STATE = closedObjectSchema(
  { ...AUTHOR_STATE_PROPERTIES, credentialId: STRING_SCHEMA },
  ['credentialId', 'intent', 'intentLabel', 'platform', 'request'],
);
const DRAFT_RESULT = closedObjectSchema(
  {
    commentId: STRING_SCHEMA,
    draft: STRING_SCHEMA,
    harnessApplied: BOOLEAN_SCHEMA,
    intent: REPLY_INTENT,
    intentLabel: STRING_SCHEMA,
  },
  ['commentId', 'draft', 'harnessApplied', 'intent', 'intentLabel'],
);
const DRAFT_STATE = closedObjectSchema(
  {
    ...AUTHOR_STATE_PROPERTIES,
    credentialId: STRING_SCHEMA,
    draftResult: DRAFT_RESULT,
    replyText: STRING_SCHEMA,
  },
  ['draftResult', 'intent', 'intentLabel', 'platform', 'replyText', 'request'],
);
const PROVIDER_RESULT = closedObjectSchema(
  {
    error: STRING_SCHEMA,
    replyContentId: STRING_SCHEMA,
    replyContentUrl: STRING_SCHEMA,
    replySent: BOOLEAN_SCHEMA,
  },
  ['replySent'],
);
const SENT_STATE = closedObjectSchema(
  {
    ...AUTHOR_STATE_PROPERTIES,
    credentialId: STRING_SCHEMA,
    draftResult: DRAFT_RESULT,
    replyText: STRING_SCHEMA,
    sendResult: PROVIDER_RESULT,
  },
  [
    'credentialId',
    'draftResult',
    'intent',
    'intentLabel',
    'platform',
    'replyText',
    'request',
    'sendResult',
  ],
);
const AUTHOR_SEND_RESULT = closedObjectSchema(
  {
    commentId: STRING_SCHEMA,
    contentId: STRING_SCHEMA,
    contentUrl: STRING_SCHEMA,
    error: STRING_SCHEMA,
    intent: REPLY_INTENT,
    replyText: STRING_SCHEMA,
    success: BOOLEAN_SCHEMA,
  },
  ['commentId', 'intent', 'replyText', 'success'],
);
const INBOUND_REQUEST = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    commentAuthorId: STRING_SCHEMA,
    commentAuthorUsername: STRING_SCHEMA,
    commentId: STRING_SCHEMA,
    commentText: STRING_SCHEMA,
    credentialId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    parentPostId: STRING_SCHEMA,
    parentPostPreview: STRING_SCHEMA,
    platform: PLATFORM,
    receivedAt: STRING_SCHEMA,
    source: enumSchema(['manual', 'poll', 'post-watch', 'xaa'] as const),
  },
  [
    'commentAuthorUsername',
    'commentId',
    'commentText',
    'organizationId',
    'parentPostId',
    'receivedAt',
    'source',
  ],
);
const INBOUND_RESULT = closedObjectSchema(
  {
    commentId: STRING_SCHEMA,
    error: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    skipped: BOOLEAN_SCHEMA,
    success: BOOLEAN_SCHEMA,
  },
  ['commentId', 'organizationId', 'skipped', 'success'],
);
const INBOUND_PREPARATION = closedObjectSchema(
  {
    input: INBOUND_REQUEST,
    items: arraySchema(AUTHOR_REQUEST),
    outcome: INBOUND_RESULT,
  },
  ['input', 'items'],
);
const WATCH_REQUEST = closedObjectSchema(
  {
    attempt: INTEGER_SCHEMA,
    brandId: STRING_SCHEMA,
    maxAttempts: INTEGER_SCHEMA,
    organizationId: STRING_SCHEMA,
    platform: PLATFORM,
    postId: STRING_SCHEMA,
    postPreview: STRING_SCHEMA,
  },
  ['attempt', 'brandId', 'maxAttempts', 'organizationId', 'postId'],
);
const WATCH_FETCH_RESULT = closedObjectSchema(
  {
    attempt: INTEGER_SCHEMA,
    brandId: STRING_SCHEMA,
    commentsFound: INTEGER_SCHEMA,
    items: arraySchema(INBOUND_REQUEST),
    maxAttempts: INTEGER_SCHEMA,
    organizationId: STRING_SCHEMA,
    platform: PLATFORM,
    postId: STRING_SCHEMA,
    postPreview: STRING_SCHEMA,
  },
  [
    'attempt',
    'brandId',
    'commentsFound',
    'items',
    'maxAttempts',
    'organizationId',
    'postId',
  ],
);
const WATCH_RESULT = closedObjectSchema(
  {
    attempt: INTEGER_SCHEMA,
    commentsFound: INTEGER_SCHEMA,
    enqueued: INTEGER_SCHEMA,
    organizationId: STRING_SCHEMA,
    postId: STRING_SCHEMA,
  },
  ['attempt', 'commentsFound', 'enqueued', 'organizationId', 'postId'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'author-reply.finalize-draft': {
    inputSchema: closedObjectSchema(
      { request: AUTHOR_REQUEST, state: DRAFT_STATE },
      ['request', 'state'],
    ),
    outputSchema: DRAFT_RESULT,
  },
  'author-reply.finalize-send': {
    inputSchema: closedObjectSchema(
      { request: AUTHOR_REQUEST, state: SENT_STATE },
      ['request', 'state'],
    ),
    outputSchema: AUTHOR_SEND_RESULT,
  },
  'author-reply.generate-draft': {
    inputSchema: closedObjectSchema(
      {
        request: AUTHOR_REQUEST,
        state: { oneOf: [AUTHOR_STATE, CREDENTIAL_STATE] },
      },
      ['request', 'state'],
    ),
    outputSchema: DRAFT_STATE,
  },
  'author-reply.resolve-credential': {
    inputSchema: closedObjectSchema(
      { request: AUTHOR_REQUEST, state: AUTHOR_STATE },
      ['request', 'state'],
    ),
    outputSchema: CREDENTIAL_STATE,
  },
  'author-reply.resolve-intent': {
    inputSchema: closedObjectSchema({ request: AUTHOR_REQUEST }, ['request']),
    outputSchema: AUTHOR_STATE,
  },
  'author-reply.send': {
    inputSchema: closedObjectSchema(
      { request: AUTHOR_REQUEST, state: DRAFT_STATE },
      ['request', 'state'],
    ),
    outputSchema: SENT_STATE,
  },
  'reply.inbound.finalize': {
    inputSchema: closedObjectSchema(
      {
        batch: JSON_DOCUMENT_SCHEMA,
        request: INBOUND_REQUEST,
        state: INBOUND_PREPARATION,
      },
      ['batch', 'request', 'state'],
    ),
    outputSchema: INBOUND_RESULT,
  },
  'reply.inbound.prepare': {
    inputSchema: closedObjectSchema({ request: INBOUND_REQUEST }, ['request']),
    outputSchema: INBOUND_PREPARATION,
  },
  'reply.post-watch.fetch': {
    inputSchema: closedObjectSchema({ request: WATCH_REQUEST }, ['request']),
    outputSchema: WATCH_FETCH_RESULT,
  },
  'reply.post-watch.finalize': {
    inputSchema: closedObjectSchema(
      {
        batch: JSON_DOCUMENT_SCHEMA,
        request: WATCH_REQUEST,
        state: WATCH_FETCH_RESULT,
      },
      ['batch', 'request', 'state'],
    ),
    outputSchema: WATCH_RESULT,
  },
};

export function getAuthorReplyActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
