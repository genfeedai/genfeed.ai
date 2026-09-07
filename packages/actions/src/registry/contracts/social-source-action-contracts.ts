import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  closedObjectSchema,
  NUMBER_SCHEMA,
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders';

const HISTORY_IMPORT_REQUEST = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    credentialId: STRING_SCHEMA,
    limit: NUMBER_SCHEMA,
    organizationId: STRING_SCHEMA,
    sourceId: STRING_SCHEMA,
    userId: STRING_SCHEMA,
    windowDays: NUMBER_SCHEMA,
  },
  [
    'brandId',
    'credentialId',
    'limit',
    'organizationId',
    'sourceId',
    'userId',
    'windowDays',
  ],
);

const HISTORY_IMPORT_RESULT = closedObjectSchema(
  {
    importedCount: NUMBER_SCHEMA,
    provider: nullableSchema(STRING_SCHEMA),
    rejectedCount: NUMBER_SCHEMA,
    sourceId: STRING_SCHEMA,
  },
  ['importedCount', 'provider', 'rejectedCount', 'sourceId'],
);

const OWN_ACCOUNT_RESYNC_ITEM = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    sourceId: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['brandId', 'organizationId', 'sourceId', 'userId'],
);

const OWN_ACCOUNT_RESYNC_RESULT = closedObjectSchema(
  {
    importedCount: NUMBER_SCHEMA,
    provider: nullableSchema(STRING_SCHEMA),
    rejectedCount: NUMBER_SCHEMA,
    sourceId: STRING_SCHEMA,
  },
  ['importedCount', 'provider', 'rejectedCount', 'sourceId'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'social-source.history-import.run': {
    inputSchema: closedObjectSchema({ request: HISTORY_IMPORT_REQUEST }, [
      'request',
    ]),
    outputSchema: HISTORY_IMPORT_RESULT,
  },
  'social-source.own-account-resync.discover': {
    inputSchema: closedObjectSchema({}, []),
    outputSchema: closedObjectSchema(
      { items: arraySchema(OWN_ACCOUNT_RESYNC_ITEM) },
      ['items'],
    ),
  },
  'social-source.own-account-resync.run': {
    inputSchema: closedObjectSchema({ request: OWN_ACCOUNT_RESYNC_ITEM }, [
      'request',
    ]),
    outputSchema: OWN_ACCOUNT_RESYNC_RESULT,
  },
};

export function getSocialSourceActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
