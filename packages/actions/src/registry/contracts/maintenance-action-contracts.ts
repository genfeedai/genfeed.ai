import type { ActionJsonSchema } from '../../interfaces/action-definition.interface';
import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders';

const REQUEST_INPUT = closedObjectSchema({ request: JSON_DOCUMENT_SCHEMA }, [
  'request',
]);
const ITEMS_OUTPUT = closedObjectSchema(
  { items: arraySchema(JSON_DOCUMENT_SCHEMA) },
  ['items'],
);
const COUNT_OUTPUT = closedObjectSchema({ count: INTEGER_SCHEMA }, ['count']);
const BOOLEAN_OUTPUT = (field: string): ActionJsonSchema =>
  closedObjectSchema({ [field]: BOOLEAN_SCHEMA }, [field]);
const contract = (
  inputSchema: ActionJsonSchema,
  outputSchema: ActionJsonSchema,
): ActionContractSchemas => ({ inputSchema, outputSchema });

const ENGAGEMENT_INPUT = closedObjectSchema(
  { evaluation: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
  ['evaluation', 'request'],
);
const RULE_EXECUTION = closedObjectSchema(
  {
    releaseId: nullableSchema(STRING_SCHEMA),
    requiresPublish: BOOLEAN_SCHEMA,
  },
  ['releaseId', 'requiresPublish'],
);
const STREAK_EVALUATION = closedObjectSchema(
  {
    currentStreak: NUMBER_SCHEMA,
    isAtRisk: BOOLEAN_SCHEMA,
    lastActivityDate: nullableSchema(STRING_SCHEMA),
    organizationId: STRING_SCHEMA,
    referenceDate: STRING_SCHEMA,
    shouldBreak: BOOLEAN_SCHEMA,
    shouldUseFreeze: BOOLEAN_SCHEMA,
    streakFreezes: NUMBER_SCHEMA,
    streakId: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  [
    'currentStreak',
    'isAtRisk',
    'lastActivityDate',
    'organizationId',
    'referenceDate',
    'shouldBreak',
    'shouldUseFreeze',
    'streakFreezes',
    'streakId',
    'userId',
  ],
);
const STREAK_INPUT = closedObjectSchema({ evaluation: STREAK_EVALUATION }, [
  'evaluation',
]);
const RSS_CLAIM_PROPERTIES = {
  channels: arraySchema(JSON_DOCUMENT_SCHEMA),
  context: JSON_DOCUMENT_SCHEMA,
  item: JSON_DOCUMENT_SCHEMA,
  itemRowId: STRING_SCHEMA,
  outcome: enumSchema(['skipped']),
  shouldImport: BOOLEAN_SCHEMA,
  shouldPublish: BOOLEAN_SCHEMA,
  signatures: arraySchema(JSON_DOCUMENT_SCHEMA),
  source: JSON_DOCUMENT_SCHEMA,
  targets: arraySchema(JSON_DOCUMENT_SCHEMA),
} as const;
const RSS_CLAIM_REQUIRED = [
  'channels',
  'context',
  'item',
  'itemRowId',
  'shouldImport',
  'shouldPublish',
  'signatures',
  'source',
  'targets',
] as const;
const RSS_CLAIM = closedObjectSchema(RSS_CLAIM_PROPERTIES, RSS_CLAIM_REQUIRED);
const RSS_RELEASE = closedObjectSchema(
  { ...RSS_CLAIM_PROPERTIES, releaseId: STRING_SCHEMA },
  [...RSS_CLAIM_REQUIRED, 'releaseId'],
);
const RSS_SOURCE = closedObjectSchema(
  {
    approvalMode: STRING_SCHEMA,
    brandId: nullableSchema(STRING_SCHEMA),
    createdAt: JSON_DOCUMENT_SCHEMA,
    failedCount: INTEGER_SCHEMA,
    feedUrl: STRING_SCHEMA,
    id: STRING_SCHEMA,
    importedCount: INTEGER_SCHEMA,
    importPolicy: STRING_SCHEMA,
    isDeleted: BOOLEAN_SCHEMA,
    isEnabled: BOOLEAN_SCHEMA,
    label: STRING_SCHEMA,
    lastError: nullableSchema(STRING_SCHEMA),
    lastPolledAt: nullableSchema(JSON_DOCUMENT_SCHEMA),
    organizationId: STRING_SCHEMA,
    skippedCount: INTEGER_SCHEMA,
    targetChannels: arraySchema(JSON_DOCUMENT_SCHEMA),
    timezone: STRING_SCHEMA,
    updatedAt: JSON_DOCUMENT_SCHEMA,
    userId: STRING_SCHEMA,
  },
  [
    'approvalMode',
    'brandId',
    'createdAt',
    'failedCount',
    'feedUrl',
    'id',
    'importedCount',
    'importPolicy',
    'isDeleted',
    'isEnabled',
    'label',
    'lastError',
    'lastPolledAt',
    'organizationId',
    'skippedCount',
    'targetChannels',
    'timezone',
    'updatedAt',
    'userId',
  ],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'engagement.sweep.discover': contract(REQUEST_INPUT, ITEMS_OUTPUT),
  'engagement.sweep.evaluate': contract(
    REQUEST_INPUT,
    closedObjectSchema(
      {
        outcome: enumSchema(['skip', 'expire', 'ineligible', 'trigger']),
        reason: STRING_SCHEMA,
        rule: JSON_DOCUMENT_SCHEMA,
        target: JSON_DOCUMENT_SCHEMA,
      },
      ['outcome'],
    ),
  ),
  'engagement.sweep.execute': contract(ENGAGEMENT_INPUT, RULE_EXECUTION),
  'engagement.sweep.expire': contract(
    closedObjectSchema(
      { evaluation: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
      ['request'],
    ),
    BOOLEAN_OUTPUT('expired'),
  ),
  'engagement.sweep.finalize-failure': contract(
    closedObjectSchema(
      { failure: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
      ['failure', 'request'],
    ),
    BOOLEAN_OUTPUT('completed'),
  ),
  'engagement.sweep.finalize-success': contract(
    closedObjectSchema(
      { execution: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
      ['execution', 'request'],
    ),
    closedObjectSchema(
      { completed: BOOLEAN_SCHEMA, releaseId: nullableSchema(STRING_SCHEMA) },
      ['completed', 'releaseId'],
    ),
  ),
  'engagement.sweep.mark-ineligible': contract(
    ENGAGEMENT_INPUT,
    BOOLEAN_OUTPUT('completed'),
  ),
  'engagement.sweep.publish': contract(
    closedObjectSchema(
      { execution: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
      ['execution', 'request'],
    ),
    RULE_EXECUTION,
  ),
  'review-gate.timeout.discover': contract(REQUEST_INPUT, ITEMS_OUTPUT),
  'review-gate.timeout.resolve': contract(
    REQUEST_INPUT,
    nullableSchema(
      closedObjectSchema(
        {
          executionId: STRING_SCHEMA,
          nodeId: STRING_SCHEMA,
          resolution: enumSchema(['approved', 'rejected']),
        },
        ['executionId', 'nodeId', 'resolution'],
      ),
    ),
  ),
  'rss.item.claim': contract(REQUEST_INPUT, RSS_CLAIM),
  'rss.item.create-release': contract(
    closedObjectSchema(
      { claim: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
      ['claim', 'request'],
    ),
    RSS_RELEASE,
  ),
  'rss.item.finalize': contract(
    closedObjectSchema(
      {
        failure: JSON_DOCUMENT_SCHEMA,
        outcome: JSON_DOCUMENT_SCHEMA,
        request: JSON_DOCUMENT_SCHEMA,
      },
      ['request'],
    ),
    closedObjectSchema(
      { outcome: enumSchema(['failed', 'imported', 'skipped']) },
      ['outcome'],
    ),
  ),
  'rss.item.publish': contract(
    closedObjectSchema(
      { release: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
      ['release', 'request'],
    ),
    RSS_RELEASE,
  ),
  'rss.source.fetch-items': contract(REQUEST_INPUT, ITEMS_OUTPUT),
  'rss.source.finalize': contract(
    closedObjectSchema(
      {
        failure: JSON_DOCUMENT_SCHEMA,
        request: JSON_DOCUMENT_SCHEMA,
        results: JSON_DOCUMENT_SCHEMA,
      },
      ['request'],
    ),
    RSS_SOURCE,
  ),
  'rss.sweep.discover-sources': contract(REQUEST_INPUT, ITEMS_OUTPUT),
  'streak.organization.discover-records': contract(REQUEST_INPUT, ITEMS_OUTPUT),
  'streak.record.apply-freeze': contract(STREAK_INPUT, STREAK_EVALUATION),
  'streak.record.break': contract(STREAK_INPUT, STREAK_EVALUATION),
  'streak.record.evaluate': contract(REQUEST_INPUT, STREAK_EVALUATION),
  'streak.record.notify-at-risk': contract(STREAK_INPUT, STREAK_EVALUATION),
  'streak.record.notify-broken': contract(STREAK_INPUT, STREAK_EVALUATION),
  'streak.record.notify-freeze': contract(STREAK_INPUT, STREAK_EVALUATION),
  'streak.sweep.discover-organizations': contract(REQUEST_INPUT, ITEMS_OUTPUT),
  'tiktok.status.discover': contract(REQUEST_INPUT, ITEMS_OUTPUT),
  'tiktok.status.reconcile': contract(REQUEST_INPUT, BOOLEAN_SCHEMA),
  'trends.maintenance.discover-scoped': contract(REQUEST_INPUT, ITEMS_OUTPUT),
  'trends.maintenance.expire-hashtags': contract(
    closedObjectSchema(
      { previous: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
      ['previous', 'request'],
    ),
    COUNT_OUTPUT,
  ),
  'trends.maintenance.expire-sounds': contract(
    closedObjectSchema(
      { previous: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
      ['previous', 'request'],
    ),
    COUNT_OUTPUT,
  ),
  'trends.maintenance.expire-trends': contract(
    closedObjectSchema(
      { evaluation: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
      ['request'],
    ),
    COUNT_OUTPUT,
  ),
  'trends.maintenance.expire-videos': contract(
    closedObjectSchema(
      { previous: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
      ['previous', 'request'],
    ),
    COUNT_OUTPUT,
  ),
  'trends.maintenance.fetch-dataset': contract(
    closedObjectSchema({ task: JSON_DOCUMENT_SCHEMA }, ['task']),
    closedObjectSchema(
      {
        count: INTEGER_SCHEMA,
        dataset: enumSchema(['hashtags', 'videos']),
        platform: STRING_SCHEMA,
      },
      ['count', 'dataset', 'platform'],
    ),
  ),
  'trends.maintenance.fetch-global': contract(
    closedObjectSchema(
      { previous: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
      ['previous', 'request'],
    ),
    COUNT_OUTPUT,
  ),
  'trends.maintenance.fetch-sounds': contract(
    closedObjectSchema(
      { previous: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
      ['previous', 'request'],
    ),
    COUNT_OUTPUT,
  ),
  'trends.maintenance.fetch-scoped': contract(
    closedObjectSchema({ task: JSON_DOCUMENT_SCHEMA }, ['task']),
    closedObjectSchema({ count: INTEGER_SCHEMA, platform: STRING_SCHEMA }, [
      'count',
      'platform',
    ]),
  ),
  'trends.maintenance.precompute-preview': contract(
    closedObjectSchema(
      { previous: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
      ['previous', 'request'],
    ),
    closedObjectSchema({ processed: INTEGER_SCHEMA }, ['processed']),
  ),
  'youtube.comments.discover-credentials': contract(
    REQUEST_INPUT,
    ITEMS_OUTPUT,
  ),
  'youtube.status.discover-posts': contract(REQUEST_INPUT, ITEMS_OUTPUT),
  'youtube.status.reconcile': contract(REQUEST_INPUT, BOOLEAN_SCHEMA),
};

export function getMaintenanceActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
