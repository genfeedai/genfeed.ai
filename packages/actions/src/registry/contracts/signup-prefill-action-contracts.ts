import type { ActionContractSchemas } from './action-contract.interface.js';
import {
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  JSON_DOCUMENT_SCHEMA,
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders.js';

const REQUEST = closedObjectSchema(
  {
    brandDomain: STRING_SCHEMA,
    brandId: STRING_SCHEMA,
    brandName: STRING_SCHEMA,
    email: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['brandId', 'organizationId', 'userId'],
);
const STATUS = enumSchema([
  'completed',
  'failed',
  'running',
  'skipped',
] as const);
const STATE = closedObjectSchema(
  {
    brandDomain: nullableSchema(STRING_SCHEMA),
    brandLabel: STRING_SCHEMA,
    brandVoice: JSON_DOCUMENT_SCHEMA,
    config: JSON_DOCUMENT_SCHEMA,
    hasHarnessProfile: BOOLEAN_SCHEMA,
    request: REQUEST,
    scrapedData: JSON_DOCUMENT_SCHEMA,
    status: STATUS,
    websiteUrl: STRING_SCHEMA,
  },
  ['brandDomain', 'brandLabel', 'config', 'request', 'status'],
);
const stateInput = closedObjectSchema({ state: STATE }, ['state']);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'signup.prefill.analyze': { inputSchema: stateInput, outputSchema: STATE },
  'signup.prefill.apply-defaults': {
    inputSchema: stateInput,
    outputSchema: STATE,
  },
  'signup.prefill.apply-prompt': {
    inputSchema: stateInput,
    outputSchema: STATE,
  },
  'signup.prefill.fail': {
    inputSchema: closedObjectSchema(
      { failure: JSON_DOCUMENT_SCHEMA, request: REQUEST },
      ['failure', 'request'],
    ),
    outputSchema: closedObjectSchema(
      { brandId: STRING_SCHEMA, status: enumSchema(['failed'] as const) },
      ['brandId', 'status'],
    ),
  },
  'signup.prefill.finalize': {
    inputSchema: stateInput,
    outputSchema: closedObjectSchema(
      {
        brandDomain: nullableSchema(STRING_SCHEMA),
        brandId: STRING_SCHEMA,
        hasBrandVoice: BOOLEAN_SCHEMA,
        hasHarnessProfile: BOOLEAN_SCHEMA,
        status: STATUS,
      },
      [
        'brandDomain',
        'brandId',
        'hasBrandVoice',
        'hasHarnessProfile',
        'status',
      ],
    ),
  },
  'signup.prefill.prepare': {
    inputSchema: closedObjectSchema({ request: REQUEST }, ['request']),
    outputSchema: STATE,
  },
  'signup.prefill.scrape': { inputSchema: stateInput, outputSchema: STATE },
  'signup.prefill.seed-harness': {
    inputSchema: stateInput,
    outputSchema: STATE,
  },
};

export function getSignupPrefillActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
