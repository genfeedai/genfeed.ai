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
    contextBaseId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    sourceId: STRING_SCHEMA,
  },
  ['contextBaseId', 'organizationId', 'sourceId'],
);
const SOURCE = closedObjectSchema(
  {
    category: enumSchema([
      'audio',
      'document',
      'file',
      'rss',
      'url',
      'video',
    ] as const),
    chunkCount: NUMBER_SCHEMA,
    error: STRING_SCHEMA,
    id: STRING_SCHEMA,
    isDeleted: BOOLEAN_SCHEMA,
    label: STRING_SCHEMA,
    lastIngestedAt: STRING_SCHEMA,
    referenceUrl: STRING_SCHEMA,
    status: enumSchema(['completed', 'draft', 'failed', 'processing'] as const),
    summary: STRING_SCHEMA,
    tags: arraySchema(STRING_SCHEMA),
  },
  ['category', 'id', 'label', 'status'],
);
const STATE_PROPERTIES = {
  chunks: arraySchema(STRING_SCHEMA),
  contextBaseId: STRING_SCHEMA,
  currentData: JSON_DOCUMENT_SCHEMA,
  extracted: closedObjectSchema(
    { mimeType: STRING_SCHEMA, text: STRING_SCHEMA },
    ['text'],
  ),
  organizationId: STRING_SCHEMA,
  source: SOURCE,
  sources: arraySchema(SOURCE),
  status: enumSchema([
    'completed',
    'failed',
    'ready',
    'skipped',
    'unsupported',
  ] as const),
} as const;
const STATE = closedObjectSchema(STATE_PROPERTIES, [
  'contextBaseId',
  'currentData',
  'organizationId',
  'sources',
  'status',
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
  },
  ['chunkCount', 'sourceId', 'status'],
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
