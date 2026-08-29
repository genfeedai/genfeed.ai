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
  summary: SUMMARY,
} as const;
const PREPARED = closedObjectSchema(PREPARED_PROPERTIES, [
  'options',
  'organizationName',
  'summary',
]);
const STATE = closedObjectSchema(
  { ...PREPARED_PROPERTIES, recipients: arraySchema(STRING_SCHEMA) },
  ['options', 'organizationName', 'recipients', 'summary'],
);
const DELIVERY = closedObjectSchema(
  { email: STRING_SCHEMA, html: STRING_SCHEMA, subject: STRING_SCHEMA },
  ['email', 'html', 'subject'],
);
const RENDERED = closedObjectSchema({ deliveries: arraySchema(DELIVERY) }, [
  'deliveries',
]);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'email-digest.deliver-recipient': {
    inputSchema: closedObjectSchema({ delivery: DELIVERY }, ['delivery']),
    outputSchema: closedObjectSchema(
      { email: STRING_SCHEMA, error: STRING_SCHEMA, sent: BOOLEAN_SCHEMA },
      ['email', 'sent'],
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
      { errors: INTEGER_SCHEMA, sent: INTEGER_SCHEMA, skipped: INTEGER_SCHEMA },
      ['errors', 'sent', 'skipped'],
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
