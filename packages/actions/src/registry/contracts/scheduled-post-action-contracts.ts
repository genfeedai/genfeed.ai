import type { ActionContractSchemas } from './action-contract.interface.js';
import {
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders.js';

const REQUEST = closedObjectSchema(
  {
    approvalId: STRING_SCHEMA,
    operationId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    postId: STRING_SCHEMA,
    source: enumSchema([
      'manual_retry',
      'publish_now',
      'scheduled_sweep',
    ] as const),
    userId: STRING_SCHEMA,
    versionPinId: STRING_SCHEMA,
  },
  ['organizationId', 'postId', 'source'],
);
const PUBLISH_RESULT = closedObjectSchema(
  {
    error: STRING_SCHEMA,
    errorCode: STRING_SCHEMA,
    executionState: enumSchema([
      'cancelled',
      'draft',
      'failed',
      'paused',
      'published',
      'publishing',
      'scheduled',
      'skipped',
    ] as const),
    externalId: nullableSchema(STRING_SCHEMA),
    externalShortcode: nullableSchema(STRING_SCHEMA),
    isProviderDraft: BOOLEAN_SCHEMA,
    platform: STRING_SCHEMA,
    success: BOOLEAN_SCHEMA,
    url: STRING_SCHEMA,
  },
  ['executionState', 'externalId', 'platform', 'success', 'url'],
);
const CLAIM = closedObjectSchema(
  {
    executionStartedAt: nullableSchema(STRING_SCHEMA),
    isAlreadyPublished: BOOLEAN_SCHEMA,
    publishedResult: PUBLISH_RESULT,
  },
  ['executionStartedAt', 'isAlreadyPublished', 'publishedResult'],
);
const SKIPPED = closedObjectSchema(
  {
    reason: enumSchema(['not_eligible'] as const),
    skipped: { const: true, type: 'boolean' },
  },
  ['reason', 'skipped'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'evergreen-release-expansion': {
    inputSchema: closedObjectSchema(
      {
        groupId: STRING_SCHEMA,
        organizationId: STRING_SCHEMA,
        sourcePostId: STRING_SCHEMA,
      },
      ['groupId', 'organizationId', 'sourcePostId'],
    ),
    outputSchema: {
      oneOf: [
        closedObjectSchema(
          { status: enumSchema(['exhausted', 'not_applicable'] as const) },
          ['status'],
        ),
        closedObjectSchema(
          {
            occurrenceId: STRING_SCHEMA,
            status: enumSchema(['created', 'reused'] as const),
          },
          ['occurrenceId', 'status'],
        ),
      ],
    },
  },
  'scheduled-post.claim': {
    inputSchema: closedObjectSchema({ request: REQUEST }, ['request']),
    outputSchema: CLAIM,
  },
  'scheduled-post.deliver': {
    inputSchema: closedObjectSchema({ claim: CLAIM, request: REQUEST }, [
      'claim',
      'request',
    ]),
    outputSchema: PUBLISH_RESULT,
  },
  'scheduled-post.fail': {
    inputSchema: closedObjectSchema(
      { request: REQUEST, workflowError: STRING_SCHEMA },
      ['request'],
    ),
    outputSchema: { oneOf: [PUBLISH_RESULT, SKIPPED] },
  },
  'scheduled-post.finalize': {
    inputSchema: closedObjectSchema(
      { claim: CLAIM, delivery: PUBLISH_RESULT, request: REQUEST },
      ['claim', 'delivery', 'request'],
    ),
    outputSchema: PUBLISH_RESULT,
  },
};

export function getScheduledPostActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
