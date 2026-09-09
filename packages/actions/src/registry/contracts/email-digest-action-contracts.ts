import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const REQUEST = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    endDate: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    recipientEmails: arraySchema(STRING_SCHEMA),
    startDate: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['brandId', 'organizationId'],
);
const PERFORMANCE_ITEM = closedObjectSchema(
  {
    id: STRING_SCHEMA,
    origin: enumSchema(['genfeed', 'imported'] as const),
    sourcePostId: STRING_SCHEMA,
    comments: NUMBER_SCHEMA,
    description: STRING_SCHEMA,
    engagementRate: NUMBER_SCHEMA,
    likes: NUMBER_SCHEMA,
    platform: STRING_SCHEMA,
    postId: STRING_SCHEMA,
    publishDate: STRING_SCHEMA,
    saves: NUMBER_SCHEMA,
    shares: NUMBER_SCHEMA,
    title: STRING_SCHEMA,
    views: NUMBER_SCHEMA,
  },
  [
    'comments',
    'description',
    'engagementRate',
    'likes',
    'platform',
    'postId',
    'saves',
    'shares',
    'title',
    'views',
  ],
);
const PLATFORM_GROUP = closedObjectSchema(
  {
    avgEngagementRate: NUMBER_SCHEMA,
    platform: STRING_SCHEMA,
    totalPosts: NUMBER_SCHEMA,
  },
  ['avgEngagementRate', 'platform', 'totalPosts'],
);
const CONTENT_GROUP = closedObjectSchema(
  {
    avgEngagementRate: NUMBER_SCHEMA,
    category: STRING_SCHEMA,
    totalPosts: NUMBER_SCHEMA,
  },
  ['avgEngagementRate', 'category', 'totalPosts'],
);
const POSTING_TIME = closedObjectSchema(
  {
    avgEngagementRate: NUMBER_SCHEMA,
    hour: NUMBER_SCHEMA,
    postCount: NUMBER_SCHEMA,
  },
  ['avgEngagementRate', 'hour', 'postCount'],
);
const SUMMARY = closedObjectSchema(
  {
    dataset: closedObjectSchema(
      {
        genfeedPosts: INTEGER_SCHEMA,
        importedPosts: INTEGER_SCHEMA,
        totalPosts: INTEGER_SCHEMA,
        confidence: enumSchema(['none', 'low', 'medium', 'high'] as const),
      },
      ['genfeedPosts', 'importedPosts', 'totalPosts', 'confidence'],
    ),
    avgEngagementByContentType: arraySchema(CONTENT_GROUP),
    avgEngagementByPlatform: arraySchema(PLATFORM_GROUP),
    bestPostingTimes: arraySchema(POSTING_TIME),
    topHooks: arraySchema(STRING_SCHEMA),
    topPerformers: arraySchema(PERFORMANCE_ITEM),
    weekOverWeekTrend: closedObjectSchema(
      {
        currentEngagement: NUMBER_SCHEMA,
        direction: enumSchema(['down', 'stable', 'up'] as const),
        percentageChange: NUMBER_SCHEMA,
        previousEngagement: NUMBER_SCHEMA,
      },
      [
        'currentEngagement',
        'direction',
        'percentageChange',
        'previousEngagement',
      ],
    ),
    worstPerformers: arraySchema(PERFORMANCE_ITEM),
  },
  [
    'avgEngagementByContentType',
    'avgEngagementByPlatform',
    'bestPostingTimes',
    'topHooks',
    'topPerformers',
    'weekOverWeekTrend',
    'worstPerformers',
  ],
);
const PREPARED_PROPERTIES = {
  options: REQUEST,
  organizationName: STRING_SCHEMA,
  destinationUrl: STRING_SCHEMA,
  summary: SUMMARY,
} as const;
const PREPARED = closedObjectSchema(PREPARED_PROPERTIES, [
  'options',
  'organizationName',
  'destinationUrl',
  'summary',
]);
const STATE = closedObjectSchema(
  { ...PREPARED_PROPERTIES, recipientUserIds: arraySchema(STRING_SCHEMA) },
  [
    'options',
    'organizationName',
    'destinationUrl',
    'recipientUserIds',
    'summary',
  ],
);
const DELIVERY = closedObjectSchema(
  {
    userId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    brandId: STRING_SCHEMA,
    startDate: STRING_SCHEMA,
    endDate: STRING_SCHEMA,
    destinationUrl: STRING_SCHEMA,
    html: STRING_SCHEMA,
    subject: STRING_SCHEMA,
  },
  [
    'userId',
    'organizationId',
    'brandId',
    'startDate',
    'endDate',
    'destinationUrl',
    'html',
    'subject',
  ],
);
const RENDERED = closedObjectSchema({ deliveries: arraySchema(DELIVERY) }, [
  'deliveries',
]);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'email-digest.deliver-recipient': {
    inputSchema: closedObjectSchema({ delivery: DELIVERY }, ['delivery']),
    outputSchema: closedObjectSchema(
      {
        userId: STRING_SCHEMA,
        error: STRING_SCHEMA,
        queued: BOOLEAN_SCHEMA,
        deliveryId: STRING_SCHEMA,
      },
      ['userId', 'queued'],
    ),
  },
  'email-digest.discover-recipients': {
    inputSchema: closedObjectSchema({ prepared: PREPARED }, ['prepared']),
    outputSchema: STATE,
  },
  'email-digest.finalize': {
    inputSchema: closedObjectSchema(
      { dispatch: JSON_DOCUMENT_SCHEMA, rendered: RENDERED },
      ['dispatch', 'rendered'],
    ),
    outputSchema: closedObjectSchema(
      {
        errors: INTEGER_SCHEMA,
        sent: INTEGER_SCHEMA,
        queued: INTEGER_SCHEMA,
        skipped: INTEGER_SCHEMA,
      },
      ['errors', 'sent', 'queued', 'skipped'],
    ),
  },
  'email-digest.prepare': {
    inputSchema: closedObjectSchema({ request: REQUEST }, ['request']),
    outputSchema: PREPARED,
  },
  'email-digest.render': {
    inputSchema: closedObjectSchema({ state: STATE }, ['state']),
    outputSchema: RENDERED,
  },
};

export function getEmailDigestActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
