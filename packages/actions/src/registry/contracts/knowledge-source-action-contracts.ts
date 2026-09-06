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

const INGEST_REQUEST = closedObjectSchema(
  {
    organizationId: STRING_SCHEMA,
    sourceId: STRING_SCHEMA,
    versionId: STRING_SCHEMA,
  },
  ['organizationId', 'sourceId', 'versionId'],
);
const SOURCE = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    id: STRING_SCHEMA,
    kind: enumSchema([
      'AUDIO',
      'DOCUMENT',
      'FILE',
      'RSS',
      'TEXT',
      'URL',
      'VIDEO',
    ] as const),
    purpose: enumSchema(['BRAND_TRUTH', 'INSPIRATION', 'RESEARCH'] as const),
    scope: enumSchema(['brand', 'org', 'personal'] as const),
    title: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['id', 'kind', 'purpose', 'scope', 'title', 'userId'],
);
const VERSION = closedObjectSchema(
  {
    id: STRING_SCHEMA,
    isCurrent: BOOLEAN_SCHEMA,
    referenceUrl: STRING_SCHEMA,
    text: STRING_SCHEMA,
    version: NUMBER_SCHEMA,
  },
  ['id', 'isCurrent', 'version'],
);
const STATE_PROPERTIES = {
  chunks: arraySchema(STRING_SCHEMA),
  extracted: closedObjectSchema(
    { mimeType: STRING_SCHEMA, text: STRING_SCHEMA },
    ['text'],
  ),
  failure: STRING_SCHEMA,
  organizationId: STRING_SCHEMA,
  source: SOURCE,
  sourceId: STRING_SCHEMA,
  status: enumSchema(['failed', 'ready', 'skipped', 'unsupported'] as const),
  version: VERSION,
  versionId: STRING_SCHEMA,
} as const;
const STATE = closedObjectSchema(STATE_PROPERTIES, [
  'organizationId',
  'sourceId',
  'status',
  'versionId',
]);
const RESULT = closedObjectSchema(
  {
    chunkCount: NUMBER_SCHEMA,
    sourceId: STRING_SCHEMA,
    status: enumSchema([
      'completed',
      'failed',
      'skipped',
      'unsupported',
    ] as const),
    versionId: STRING_SCHEMA,
  },
  ['chunkCount', 'sourceId', 'status', 'versionId'],
);
const FAILURE = closedObjectSchema(
  {
    error: STRING_SCHEMA,
    failedNodeId: STRING_SCHEMA,
    nodeOutputs: JSON_DOCUMENT_SCHEMA,
  },
  ['error', 'failedNodeId', 'nodeOutputs'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'knowledge.source.chunk': {
    inputSchema: closedObjectSchema({ state: STATE }, ['state']),
    outputSchema: STATE,
  },
  'knowledge.source.discover-backfill': {
    inputSchema: closedObjectSchema(
      {
        request: closedObjectSchema({ organizationId: STRING_SCHEMA }, [
          'organizationId',
        ]),
      },
      ['request'],
    ),
    outputSchema: closedObjectSchema({ items: arraySchema(INGEST_REQUEST) }, [
      'items',
    ]),
  },
  'knowledge.source.extract': {
    inputSchema: closedObjectSchema({ state: STATE }, ['state']),
    outputSchema: STATE,
  },
  'knowledge.source.finalize': {
    inputSchema: {
      oneOf: [
        closedObjectSchema({ state: STATE }, ['state']),
        closedObjectSchema({ failure: FAILURE, state: STATE }, ['failure']),
      ],
    },
    outputSchema: RESULT,
  },
  'knowledge.source.load': {
    inputSchema: closedObjectSchema({ request: INGEST_REQUEST }, ['request']),
    outputSchema: STATE,
  },
  'knowledge.source.mark-processing': {
    inputSchema: closedObjectSchema({ state: STATE }, ['state']),
    outputSchema: STATE,
  },
  'knowledge.source.replace-chunks': {
    inputSchema: closedObjectSchema({ state: STATE }, ['state']),
    outputSchema: STATE,
  },
};

export function getKnowledgeSourceActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
