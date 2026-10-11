import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const GENERATION_REQUEST = closedObjectSchema(
  {
    actionContext: closedObjectSchema(
      {
        actorUserId: STRING_SCHEMA,
        apiKeyId: STRING_SCHEMA,
        origin: enumSchema([
          'agent',
          'api',
          'cli',
          'mcp',
          'ui',
          'unknown',
          'workflow',
        ] as const),
      },
      ['origin'],
    ),
    turboRunId: STRING_SCHEMA,
    isResume: BOOLEAN_SCHEMA,
    organizationId: STRING_SCHEMA,
    runId: STRING_SCHEMA,
    threadId: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['turboRunId', 'organizationId', 'userId'],
);
const CONTENT_MIX = closedObjectSchema(
  {
    carouselPercent: NUMBER_SCHEMA,
    imagePercent: NUMBER_SCHEMA,
    reelPercent: NUMBER_SCHEMA,
    storyPercent: NUMBER_SCHEMA,
    videoPercent: NUMBER_SCHEMA,
  },
  [
    'carouselPercent',
    'imagePercent',
    'reelPercent',
    'storyPercent',
    'videoPercent',
  ],
);
const TURBO_RUN_ITEM = closedObjectSchema(
  {
    assignee: JSON_DOCUMENT_SCHEMA,
    assigneeId: { anyOf: [STRING_SCHEMA, { type: 'null' }] },
    turboRunId: STRING_SCHEMA,
    caption: STRING_SCHEMA,
    contentRunId: STRING_SCHEMA,
    createdAt: STRING_SCHEMA,
    creativeVersion: STRING_SCHEMA,
    error: STRING_SCHEMA,
    format: enumSchema([
      'article',
      'carousel',
      'image',
      'newsletter',
      'post',
      'reel',
      'story',
      'video',
    ] as const),
    id: STRING_SCHEMA,
    ingredientId: STRING_SCHEMA,
    mediaUrl: STRING_SCHEMA,
    platform: STRING_SCHEMA,
    postAvgEngagementRate: NUMBER_SCHEMA,
    postExternalId: STRING_SCHEMA,
    postGenerationId: STRING_SCHEMA,
    postId: STRING_SCHEMA,
    postLastAttemptAt: STRING_SCHEMA,
    postPublishedAt: STRING_SCHEMA,
    postRetryCount: NUMBER_SCHEMA,
    postStatus: STRING_SCHEMA,
    postTotalComments: NUMBER_SCHEMA,
    postTotalLikes: NUMBER_SCHEMA,
    postTotalShares: NUMBER_SCHEMA,
    postTotalViews: NUMBER_SCHEMA,
    postUrl: STRING_SCHEMA,
    prompt: STRING_SCHEMA,
    publishApproval: JSON_DOCUMENT_SCHEMA,
    reviewDecision: STRING_SCHEMA,
    reviewEvents: arraySchema(JSON_DOCUMENT_SCHEMA),
    reviewFeedback: STRING_SCHEMA,
    reviewedAt: STRING_SCHEMA,
    scheduledDate: STRING_SCHEMA,
    sourceActionId: STRING_SCHEMA,
    sourceWorkflowId: STRING_SCHEMA,
    sourceWorkflowName: STRING_SCHEMA,
    status: enumSchema([
      'COMPLETED',
      'FAILED',
      'PENDING',
      'PROCESSING',
      'SKIPPED',
    ] as const),
    targetAuthor: STRING_SCHEMA,
    targetPostContent: STRING_SCHEMA,
    targetPostId: STRING_SCHEMA,
    targetPostUrl: STRING_SCHEMA,
    type: enumSchema(['content', 'engagement'] as const),
    variantId: STRING_SCHEMA,
    versionPinId: STRING_SCHEMA,
    workflowExecutionId: STRING_SCHEMA,
  },
  ['turboRunId', 'createdAt', 'format', 'id', 'status'],
);
const TURBO_RUN_SUMMARY = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    completedAt: STRING_SCHEMA,
    completedCount: NUMBER_SCHEMA,
    completedItems: NUMBER_SCHEMA,
    contentMix: CONTENT_MIX,
    createdAt: STRING_SCHEMA,
    failedCount: NUMBER_SCHEMA,
    id: STRING_SCHEMA,
    items: arraySchema(TURBO_RUN_ITEM),
    ownedElsewhere: { const: false, type: 'boolean' },
    pendingCount: NUMBER_SCHEMA,
    platforms: arraySchema(STRING_SCHEMA),
    status: enumSchema([
      'CANCELLED',
      'COMPLETED',
      'FAILED',
      'PARTIAL',
      'PENDING',
      'PROCESSING',
    ] as const),
    totalCount: NUMBER_SCHEMA,
    totalItems: NUMBER_SCHEMA,
  },
  [
    'brandId',
    'completedCount',
    'contentMix',
    'createdAt',
    'failedCount',
    'id',
    'items',
    'ownedElsewhere',
    'pendingCount',
    'platforms',
    'status',
    'totalCount',
  ],
);
const CONTENT_REQUEST_PROPERTIES = {
  brandId: STRING_SCHEMA,
  count: { maximum: 100, minimum: 1, type: 'integer' },
  organizationId: STRING_SCHEMA,
  params: JSON_DOCUMENT_SCHEMA,
  skillSlug: STRING_SCHEMA,
} as const;
const CONTENT_REQUEST = closedObjectSchema(CONTENT_REQUEST_PROPERTIES, [
  'brandId',
  'count',
  'organizationId',
  'skillSlug',
]);
const CONTENT_ITEM = closedObjectSchema(
  { ...CONTENT_REQUEST_PROPERTIES, itemIndex: { type: 'integer' } },
  ['brandId', 'count', 'itemIndex', 'organizationId', 'skillSlug'],
);
const SKILL_CONTEXT = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    brandVoice: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    platforms: arraySchema(STRING_SCHEMA),
  },
  ['brandId', 'brandVoice', 'organizationId', 'platforms'],
);
const GENERATED_CONTENT = closedObjectSchema(
  {
    confidence: NUMBER_SCHEMA,
    content: STRING_SCHEMA,
    mediaUrls: arraySchema(STRING_SCHEMA),
    metadata: JSON_DOCUMENT_SCHEMA,
    platforms: arraySchema(STRING_SCHEMA),
    skillSlug: STRING_SCHEMA,
    type: STRING_SCHEMA,
  },
  ['content', 'metadata', 'platforms', 'skillSlug', 'type'],
);
const PLAN = closedObjectSchema(
  { items: arraySchema(CONTENT_ITEM), startedAt: NUMBER_SCHEMA },
  ['items', 'startedAt'],
);

const TURBO_PROJECT_IDEA_DISPATCH_JOB = closedObjectSchema(
  {
    itemId: STRING_SCHEMA,
    key: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    projectId: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['itemId', 'key', 'organizationId', 'projectId', 'userId'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'turbo-project.idea.dispatch-item': {
    inputSchema: closedObjectSchema({ job: TURBO_PROJECT_IDEA_DISPATCH_JOB }, [
      'job',
    ]),
    outputSchema: closedObjectSchema(
      { status: enumSchema(['dispatched', 'failed', 'skipped'] as const) },
      ['status'],
    ),
  },
  'turbo-project.idea.fail-item': {
    inputSchema: closedObjectSchema({ job: TURBO_PROJECT_IDEA_DISPATCH_JOB }, [
      'job',
    ]),
    outputSchema: closedObjectSchema(
      { status: { const: 'failed', type: 'string' } },
      ['status'],
    ),
  },
  'turbo.run.mark-queued': {
    inputSchema: closedObjectSchema({ request: GENERATION_REQUEST }, [
      'request',
    ]),
    outputSchema: closedObjectSchema({ queued: BOOLEAN_SCHEMA }, ['queued']),
  },
  'turbo.run.process': {
    inputSchema: closedObjectSchema(
      {
        queued: closedObjectSchema({ queued: BOOLEAN_SCHEMA }, ['queued']),
        request: GENERATION_REQUEST,
      },
      ['queued', 'request'],
    ),
    outputSchema: {
      oneOf: [
        TURBO_RUN_SUMMARY,
        closedObjectSchema(
          { ownedElsewhere: { const: true, type: 'boolean' } },
          ['ownedElsewhere'],
        ),
      ],
    },
  },
  'turbo.run.settle': {
    inputSchema: closedObjectSchema(
      {
        completion: JSON_DOCUMENT_SCHEMA,
        failure: JSON_DOCUMENT_SCHEMA,
        request: GENERATION_REQUEST,
      },
      ['request'],
    ),
    outputSchema: closedObjectSchema({ settled: BOOLEAN_SCHEMA }, ['settled']),
  },
  'content.turbo.item.prepare': {
    inputSchema: closedObjectSchema({ item: CONTENT_ITEM }, ['item']),
    outputSchema: closedObjectSchema(
      { context: SKILL_CONTEXT, params: JSON_DOCUMENT_SCHEMA },
      ['context', 'params'],
    ),
  },
  'content.turbo.plan': {
    inputSchema: closedObjectSchema({ request: CONTENT_REQUEST }, ['request']),
    outputSchema: PLAN,
  },
  'content.turbo.rank': {
    inputSchema: closedObjectSchema(
      { batch: JSON_DOCUMENT_SCHEMA, plan: PLAN },
      ['batch', 'plan'],
    ),
    outputSchema: closedObjectSchema(
      {
        duration: NUMBER_SCHEMA,
        results: arraySchema(GENERATED_CONTENT),
        summary: closedObjectSchema(
          {
            completed: NUMBER_SCHEMA,
            failed: NUMBER_SCHEMA,
            total: NUMBER_SCHEMA,
          },
          ['completed', 'failed', 'total'],
        ),
      },
      ['duration', 'results', 'summary'],
    ),
  },
};

export function getTurboRunActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
