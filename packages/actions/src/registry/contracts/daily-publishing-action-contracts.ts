import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const REQUEST_PROPERTIES = {
  brandId: STRING_SCHEMA,
  credentialIds: arraySchema(STRING_SCHEMA),
  topics: arraySchema(STRING_SCHEMA),
  timezone: STRING_SCHEMA,
  autoPublish: BOOLEAN_SCHEMA,
  minScore: { type: 'number', minimum: 7, maximum: 10 },
  agentStrategyId: STRING_SCHEMA,
} as const;
const REQUEST = closedObjectSchema(REQUEST_PROPERTIES, ['brandId']);
const SOURCE = closedObjectSchema(
  {
    id: STRING_SCHEMA,
    kind: enumSchema(['winner', 'trend', 'topic']),
    text: STRING_SCHEMA,
  },
  ['id', 'kind', 'text'],
);
const ACCOUNT_PROPERTIES = {
  credentialId: STRING_SCHEMA,
  platform: enumSchema(['twitter', 'linkedin']),
  accountLabel: STRING_SCHEMA,
  slotKey: STRING_SCHEMA,
};
const ACCOUNT = closedObjectSchema(ACCOUNT_PROPERTIES, [
  'credentialId',
  'platform',
  'accountLabel',
  'slotKey',
]);
const STATE = closedObjectSchema(
  {
    ...ACCOUNT_PROPERTIES,
    request: REQUEST,
    sources: arraySchema(SOURCE),
    refreshError: STRING_SCHEMA,
    analyticsRefreshError: STRING_SCHEMA,
    postId: STRING_SCHEMA,
    source: SOURCE,
    recentTexts: arraySchema(STRING_SCHEMA),
    score: NUMBER_SCHEMA,
    outcome: STRING_SCHEMA,
  },
  ['credentialId', 'platform', 'accountLabel', 'slotKey', 'request', 'sources'],
);
const PLAN = closedObjectSchema(
  { request: REQUEST, accounts: arraySchema(ACCOUNT) },
  ['request', 'accounts'],
);
export function getDailyPublishingActionContract(
  id: string,
): ActionContractSchemas | undefined {
  switch (id) {
    case 'daily-publishing.resolve':
      return { inputSchema: REQUEST, outputSchema: PLAN };
    case 'daily-publishing.refresh':
      return {
        inputSchema: closedObjectSchema({ state: PLAN }, ['state']),
        outputSchema: closedObjectSchema({ items: arraySchema(STATE) }, [
          'items',
        ]),
      };
    case 'daily-publishing.collect-analytics':
      return {
        inputSchema: closedObjectSchema({ item: STATE }, ['item']),
        outputSchema: STATE,
      };
    case 'daily-publishing.select':
    case 'daily-publishing.generate':
    case 'daily-publishing.evaluate':
    case 'daily-publishing.schedule':
      return {
        inputSchema: closedObjectSchema({ state: STATE }, ['state']),
        outputSchema: STATE,
      };
    default:
      return undefined;
  }
}
