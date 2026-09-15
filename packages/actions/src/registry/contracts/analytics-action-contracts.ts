import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const ANALYTICS_POST = closedObjectSchema(
  {
    attemptKey: STRING_SCHEMA,
    brandId: STRING_SCHEMA,
    credentialId: STRING_SCHEMA,
    externalId: STRING_SCHEMA,
    id: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    platform: STRING_SCHEMA,
  },
  ['attemptKey', 'brandId', 'externalId', 'id', 'organizationId', 'platform'],
);
const OUTLIER_ACCOUNT = closedObjectSchema(
  {
    organizationId: STRING_SCHEMA,
    brandId: STRING_SCHEMA,
    credentialId: STRING_SCHEMA,
  },
  ['organizationId', 'brandId', 'credentialId'],
);
const COLLECTION_RESULT = closedObjectSchema(
  {
    attempted: INTEGER_SCHEMA,
    batches: INTEGER_SCHEMA,
    outlierAccount: OUTLIER_ACCOUNT,
  },
  ['attempted', 'batches', 'outlierAccount'],
);
const SYNC_ITEM = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    clicks: NUMBER_SCHEMA,
    comments: NUMBER_SCHEMA,
    contentRunId: STRING_SCHEMA,
    contentType: STRING_SCHEMA,
    creativeVersion: STRING_SCHEMA,
    externalPostId: STRING_SCHEMA,
    generationId: STRING_SCHEMA,
    hookVersion: STRING_SCHEMA,
    likes: NUMBER_SCHEMA,
    measuredAt: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    personaId: STRING_SCHEMA,
    platform: STRING_SCHEMA,
    postId: STRING_SCHEMA,
    publishIntent: STRING_SCHEMA,
    saves: NUMBER_SCHEMA,
    scheduleSlot: STRING_SCHEMA,
    shares: NUMBER_SCHEMA,
    sourceAnalyticsId: STRING_SCHEMA,
    userId: STRING_SCHEMA,
    variantId: STRING_SCHEMA,
    views: NUMBER_SCHEMA,
    workflowExecutionId: STRING_SCHEMA,
  },
  [
    'brandId',
    'clicks',
    'comments',
    'contentType',
    'likes',
    'measuredAt',
    'organizationId',
    'postId',
    'saves',
    'shares',
    'sourceAnalyticsId',
    'views',
  ],
);
const PERSISTED_ITEM = closedObjectSchema(
  { contentPerformanceId: STRING_SCHEMA, item: SYNC_ITEM },
  ['contentPerformanceId', 'item'],
);
const SCHEDULED_COLLECTION = closedObjectSchema(
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
const AWAITED_COLLECTION = closedObjectSchema(
  {
    count: INTEGER_SCHEMA,
    results: arraySchema({
      anyOf: [
        closedObjectSchema(
          {
            index: INTEGER_SCHEMA,
            provenance: closedObjectSchema(
              {
                executionId: STRING_SCHEMA,
                workflowId: STRING_SCHEMA,
                workflowLabel: STRING_SCHEMA,
                idempotencyKey: STRING_SCHEMA,
                nodeId: STRING_SCHEMA,
              },
              ['executionId', 'workflowId', 'workflowLabel'],
            ),
            result: COLLECTION_RESULT,
          },
          ['index', 'provenance', 'result'],
        ),
        closedObjectSchema(
          {
            index: INTEGER_SCHEMA,
            error: STRING_SCHEMA,
            executionId: STRING_SCHEMA,
            status: enumSchema(['failed'] as const),
          },
          ['index', 'error', 'status'],
        ),
      ],
    }),
  },
  ['count', 'results'],
);
const WINDOW = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    since: STRING_SCHEMA,
  },
  ['organizationId'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'analytics.collection.finalize': {
    inputSchema: closedObjectSchema(
      { collection: { anyOf: [SCHEDULED_COLLECTION, AWAITED_COLLECTION] } },
      ['collection'],
    ),
    outputSchema: closedObjectSchema(
      {
        attempted: INTEGER_SCHEMA,
        batches: INTEGER_SCHEMA,
        failed: INTEGER_SCHEMA,
        status: enumSchema(['completed', 'completed_with_errors'] as const),
      },
      ['attempted', 'batches', 'status'],
    ),
  },
  'analytics.facebook.collect': {
    inputSchema: closedObjectSchema(
      { item: ANALYTICS_POST, deferOutlierRefresh: BOOLEAN_SCHEMA },
      ['item'],
    ),
    outputSchema: COLLECTION_RESULT,
  },
  'analytics.generic.detect-alerts': {
    inputSchema: closedObjectSchema({ persisted: PERSISTED_ITEM }, [
      'persisted',
    ]),
    outputSchema: closedObjectSchema(
      { alerts: INTEGER_SCHEMA, contentPerformanceId: STRING_SCHEMA },
      ['alerts', 'contentPerformanceId'],
    ),
  },
  'analytics.generic.discover': {
    inputSchema: closedObjectSchema({ window: WINDOW }, ['window']),
    outputSchema: closedObjectSchema({ items: arraySchema(SYNC_ITEM) }, [
      'items',
    ]),
  },
  'analytics.generic.persist': {
    inputSchema: closedObjectSchema({ item: SYNC_ITEM }, ['item']),
    outputSchema: PERSISTED_ITEM,
  },
  'analytics.generic.resolve-window': {
    inputSchema: closedObjectSchema({
      brandId: STRING_SCHEMA,
      since: STRING_SCHEMA,
    }),
    outputSchema: WINDOW,
  },
  'analytics.generic.sync-memory': {
    inputSchema: closedObjectSchema({ persisted: PERSISTED_ITEM }, [
      'persisted',
    ]),
    outputSchema: PERSISTED_ITEM,
  },
  'analytics.posts.discover': {
    inputSchema: closedObjectSchema(
      {
        analyticsEnabledOnly: BOOLEAN_SCHEMA,
        platforms: arraySchema(STRING_SCHEMA),
        postId: STRING_SCHEMA,
      },
      ['platforms'],
    ),
    outputSchema: closedObjectSchema(
      {
        attemptKey: STRING_SCHEMA,
        posts: arraySchema(ANALYTICS_POST),
        requested: INTEGER_SCHEMA,
        skipped: INTEGER_SCHEMA,
      },
      ['attemptKey', 'posts', 'requested', 'skipped'],
    ),
  },
  'analytics.social.collect': {
    inputSchema: closedObjectSchema(
      { item: ANALYTICS_POST, deferOutlierRefresh: BOOLEAN_SCHEMA },
      ['item'],
    ),
    outputSchema: COLLECTION_RESULT,
  },
  'analytics.threads.collect': {
    inputSchema: closedObjectSchema(
      { item: ANALYTICS_POST, deferOutlierRefresh: BOOLEAN_SCHEMA },
      ['item'],
    ),
    outputSchema: COLLECTION_RESULT,
  },
  'analytics.twitter.collect': {
    inputSchema: closedObjectSchema(
      { item: ANALYTICS_POST, deferOutlierRefresh: BOOLEAN_SCHEMA },
      ['item'],
    ),
    outputSchema: COLLECTION_RESULT,
  },
  'analytics.youtube.collect': {
    inputSchema: closedObjectSchema(
      { item: ANALYTICS_POST, deferOutlierRefresh: BOOLEAN_SCHEMA },
      ['item'],
    ),
    outputSchema: COLLECTION_RESULT,
  },
};

export function getAnalyticsActionContract(
  actionId: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[actionId];
}
