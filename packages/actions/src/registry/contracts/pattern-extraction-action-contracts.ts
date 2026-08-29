import type { ActionContractSchemas } from './action-contract.interface.js';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders.js';

const CURSOR = closedObjectSchema(
  { measuredAt: STRING_SCHEMA, sourceId: STRING_SCHEMA },
  ['measuredAt', 'sourceId'],
);
const CHECKPOINT = closedObjectSchema(
  {
    data: JSON_DOCUMENT_SCHEMA,
    measuredAt: STRING_SCHEMA,
    sourceId: STRING_SCHEMA,
  },
  ['data', 'measuredAt', 'sourceId'],
);
const STATE_PROPERTIES = {
  adCheckpoint: CHECKPOINT,
  adCursor: CURSOR,
  contentCheckpoint: CHECKPOINT,
  contentCursor: CURSOR,
  groups: JSON_DOCUMENT_SCHEMA,
  organizationId: STRING_SCHEMA,
} as const;
const STATE = closedObjectSchema(STATE_PROPERTIES, [
  'groups',
  'organizationId',
]);
const CANDIDATE = closedObjectSchema(
  {
    fingerprint: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    privatePattern: JSON_DOCUMENT_SCHEMA,
    sampleSize: NUMBER_SCHEMA,
    scoreSum: NUMBER_SCHEMA,
  },
  ['fingerprint', 'organizationId', 'privatePattern', 'sampleSize', 'scoreSum'],
);
const BUILT_STATE = closedObjectSchema(
  { ...STATE_PROPERTIES, items: arraySchema(CANDIDATE) },
  ['groups', 'items', 'organizationId'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'patterns.extraction.build': {
    inputSchema: closedObjectSchema({ state: STATE }, ['state']),
    outputSchema: BUILT_STATE,
  },
  'patterns.extraction.load': {
    inputSchema: closedObjectSchema({}),
    outputSchema: STATE,
  },
  'patterns.extraction.persist-candidate': {
    inputSchema: closedObjectSchema({ item: CANDIDATE }, ['item']),
    outputSchema: closedObjectSchema({ promotedPublic: BOOLEAN_SCHEMA }, [
      'promotedPublic',
    ]),
  },
  'patterns.extraction.save-checkpoints': {
    inputSchema: closedObjectSchema(
      { persistence: JSON_DOCUMENT_SCHEMA, state: BUILT_STATE },
      ['persistence', 'state'],
    ),
    outputSchema: closedObjectSchema(
      { persisted: NUMBER_SCHEMA, status: enumSchema(['completed'] as const) },
      ['persisted', 'status'],
    ),
  },
  'patterns.extraction.scan-ads': {
    inputSchema: closedObjectSchema({ state: STATE }, ['state']),
    outputSchema: STATE,
  },
  'patterns.extraction.scan-content': {
    inputSchema: closedObjectSchema({ state: STATE }, ['state']),
    outputSchema: STATE,
  },
};

export function getPatternExtractionActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
