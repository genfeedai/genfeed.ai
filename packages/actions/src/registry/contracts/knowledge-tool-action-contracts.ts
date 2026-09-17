import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  NULL_SCHEMA,
  NUMBER_SCHEMA,
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders';
import { toolActionOutputSchema } from './tool-action-contract';

const KNOWLEDGE_KIND = enumSchema([
  'AUDIO',
  'DOCUMENT',
  'FILE',
  'RSS',
  'TEXT',
  'URL',
  'VIDEO',
] as const);
const KNOWLEDGE_PURPOSE = enumSchema([
  'BRAND_TRUTH',
  'INSPIRATION',
  'RESEARCH',
] as const);
const KNOWLEDGE_SCOPE = enumSchema(['brand', 'org', 'personal'] as const);
const KNOWLEDGE_PROCESSING_STATE = enumSchema([
  'FAILED',
  'PROCESSING',
  'QUEUED',
  'READY',
] as const);
const KNOWLEDGE_RETRIEVAL_STATE = enumSchema([
  'ACTIVE',
  'CONTRADICTED',
  'EXPIRED',
  'QUARANTINED',
  'STALE',
  'SUPERSEDED',
] as const);

export const KNOWLEDGE_WORKFLOW_PROVENANCE_SCHEMA = closedObjectSchema(
  {
    nodeId: STRING_SCHEMA,
    runId: STRING_SCHEMA,
    sources: arraySchema(
      closedObjectSchema(
        {
          sourceId: STRING_SCHEMA,
          sourceVersionId: nullableSchema(STRING_SCHEMA),
        },
        ['sourceId', 'sourceVersionId'],
      ),
    ),
    workflowVersionId: STRING_SCHEMA,
  },
  ['nodeId', 'runId', 'sources', 'workflowVersionId'],
);

export const KNOWLEDGE_RETRIEVAL_CITATION_SCHEMA = closedObjectSchema(
  {
    kind: KNOWLEDGE_KIND,
    mediaUrl: STRING_SCHEMA,
    purpose: KNOWLEDGE_PURPOSE,
    sourceId: STRING_SCHEMA,
    startMs: INTEGER_SCHEMA,
    endMs: INTEGER_SCHEMA,
    title: STRING_SCHEMA,
    url: STRING_SCHEMA,
    version: NUMBER_SCHEMA,
    versionId: STRING_SCHEMA,
  },
  ['kind', 'purpose', 'sourceId', 'title', 'version', 'versionId'],
);

export const KNOWLEDGE_RECEIPT_SCHEMA = closedObjectSchema(
  {
    excerpt: STRING_SCHEMA,
    kind: KNOWLEDGE_KIND,
    mediaUrl: STRING_SCHEMA,
    purpose: KNOWLEDGE_PURPOSE,
    relevance: NUMBER_SCHEMA,
    sourceId: STRING_SCHEMA,
    startMs: INTEGER_SCHEMA,
    endMs: INTEGER_SCHEMA,
    title: STRING_SCHEMA,
    url: STRING_SCHEMA,
    version: NUMBER_SCHEMA,
    versionId: STRING_SCHEMA,
  },
  [
    'excerpt',
    'kind',
    'purpose',
    'relevance',
    'sourceId',
    'title',
    'version',
    'versionId',
  ],
);

const KNOWLEDGE_PASSAGE_SCHEMA = closedObjectSchema(
  {
    citation: KNOWLEDGE_RETRIEVAL_CITATION_SCHEMA,
    content: STRING_SCHEMA,
    relevance: NUMBER_SCHEMA,
  },
  ['citation', 'content', 'relevance'],
);

export const SEARCH_KNOWLEDGE_DATA_SCHEMA = closedObjectSchema(
  {
    message: STRING_SCHEMA,
    passages: arraySchema(KNOWLEDGE_PASSAGE_SCHEMA),
    query: STRING_SCHEMA,
    workflowProvenance: KNOWLEDGE_WORKFLOW_PROVENANCE_SCHEMA,
  },
  ['message', 'passages', 'query'],
);

const KNOWLEDGE_SOURCE_SUMMARY_PROPERTIES = {
  brandId: nullableSchema(STRING_SCHEMA),
  id: STRING_SCHEMA,
  isVisible: BOOLEAN_SCHEMA,
  kind: KNOWLEDGE_KIND,
  observedAt: STRING_SCHEMA,
  processingError: nullableSchema(STRING_SCHEMA),
  processingState: KNOWLEDGE_PROCESSING_STATE,
  purpose: KNOWLEDGE_PURPOSE,
  retrievalState: KNOWLEDGE_RETRIEVAL_STATE,
  scope: KNOWLEDGE_SCOPE,
  title: STRING_SCHEMA,
  version: NUMBER_SCHEMA,
  versionId: STRING_SCHEMA,
} as const;

const KNOWLEDGE_SOURCE_SUMMARY_SCHEMA = closedObjectSchema(
  KNOWLEDGE_SOURCE_SUMMARY_PROPERTIES,
  ['id', 'isVisible', 'kind', 'purpose', 'scope', 'title'],
);

const LIST_KNOWLEDGE_DATA_SCHEMA = closedObjectSchema(
  {
    limit: INTEGER_SCHEMA,
    page: INTEGER_SCHEMA,
    sources: arraySchema(KNOWLEDGE_SOURCE_SUMMARY_SCHEMA),
    total: INTEGER_SCHEMA,
    totalPages: INTEGER_SCHEMA,
    workflowProvenance: KNOWLEDGE_WORKFLOW_PROVENANCE_SCHEMA,
  },
  ['limit', 'page', 'sources', 'total', 'totalPages'],
);

const READ_KNOWLEDGE_DATA_SCHEMA = closedObjectSchema(
  {
    ...KNOWLEDGE_SOURCE_SUMMARY_PROPERTIES,
    isPreviewTruncated: BOOLEAN_SCHEMA,
    provenance: {
      anyOf: [JSON_DOCUMENT_SCHEMA, NULL_SCHEMA],
    },
    spaces: arraySchema(
      closedObjectSchema(
        {
          id: STRING_SCHEMA,
          isInbox: BOOLEAN_SCHEMA,
          title: STRING_SCHEMA,
        },
        ['id', 'isInbox', 'title'],
      ),
    ),
    textPreview: STRING_SCHEMA,
    workflowProvenance: KNOWLEDGE_WORKFLOW_PROVENANCE_SCHEMA,
  },
  ['id', 'isVisible', 'kind', 'purpose', 'scope', 'title', 'spaces'],
);

const CAPTURE_KNOWLEDGE_DATA_SCHEMA = closedObjectSchema(
  {
    ...KNOWLEDGE_SOURCE_SUMMARY_PROPERTIES,
    jobId: STRING_SCHEMA,
    message: STRING_SCHEMA,
    workflowProvenance: KNOWLEDGE_WORKFLOW_PROVENANCE_SCHEMA,
  },
  ['id', 'isVisible', 'kind', 'purpose', 'scope', 'title'],
);

const MUTATION_KNOWLEDGE_DATA_SCHEMA = closedObjectSchema(
  {
    ...KNOWLEDGE_SOURCE_SUMMARY_PROPERTIES,
    workflowProvenance: KNOWLEDGE_WORKFLOW_PROVENANCE_SCHEMA,
  },
  ['id', 'isVisible', 'kind', 'purpose', 'scope', 'title'],
);

const KNOWLEDGE_TOOL_CONTRACTS: Record<string, ActionContractSchemas> = {
  archive_knowledge_source: {
    inputSchema: closedObjectSchema({ sourceId: STRING_SCHEMA }, ['sourceId']),
    outputSchema: toolActionOutputSchema(MUTATION_KNOWLEDGE_DATA_SCHEMA),
  },
  assign_knowledge_purpose: {
    inputSchema: closedObjectSchema(
      {
        isVisible: BOOLEAN_SCHEMA,
        purpose: KNOWLEDGE_PURPOSE,
        sourceId: STRING_SCHEMA,
      },
      ['sourceId'],
    ),
    outputSchema: toolActionOutputSchema(MUTATION_KNOWLEDGE_DATA_SCHEMA),
  },
  capture_knowledge: {
    inputSchema: closedObjectSchema(
      {
        kind: KNOWLEDGE_KIND,
        purpose: KNOWLEDGE_PURPOSE,
        referenceUrl: STRING_SCHEMA,
        sourceId: STRING_SCHEMA,
        text: STRING_SCHEMA,
        title: STRING_SCHEMA,
        transcriptUrl: STRING_SCHEMA,
        isTranscriptGenerationAllowed: BOOLEAN_SCHEMA,
      },
      [],
    ),
    outputSchema: toolActionOutputSchema(CAPTURE_KNOWLEDGE_DATA_SCHEMA),
  },
  list_knowledge_sources: {
    inputSchema: closedObjectSchema({
      limit: INTEGER_SCHEMA,
      page: INTEGER_SCHEMA,
      processingState: KNOWLEDGE_PROCESSING_STATE,
      purpose: KNOWLEDGE_PURPOSE,
    }),
    outputSchema: toolActionOutputSchema(LIST_KNOWLEDGE_DATA_SCHEMA),
  },
  read_knowledge_source: {
    inputSchema: closedObjectSchema({ sourceId: STRING_SCHEMA }, ['sourceId']),
    outputSchema: toolActionOutputSchema(READ_KNOWLEDGE_DATA_SCHEMA),
  },
  retry_knowledge_ingestion: {
    inputSchema: closedObjectSchema({ sourceId: STRING_SCHEMA }, ['sourceId']),
    outputSchema: toolActionOutputSchema(MUTATION_KNOWLEDGE_DATA_SCHEMA),
  },
  search_knowledge: {
    inputSchema: closedObjectSchema(
      {
        limit: INTEGER_SCHEMA,
        purposes: arraySchema(KNOWLEDGE_PURPOSE),
        query: STRING_SCHEMA,
        sourceIds: arraySchema(STRING_SCHEMA),
      },
      ['query'],
    ),
    outputSchema: toolActionOutputSchema(SEARCH_KNOWLEDGE_DATA_SCHEMA),
  },
};

export function getKnowledgeToolActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return KNOWLEDGE_TOOL_CONTRACTS[id];
}

export const KNOWLEDGE_WORKFLOW_READ_ACTION_IDS = [
  'list_knowledge_sources',
  'read_knowledge_source',
  'search_knowledge',
] as const;

export const KNOWLEDGE_WORKFLOW_MUTATION_ACTION_IDS = [
  'archive_knowledge_source',
  'assign_knowledge_purpose',
  'capture_knowledge',
  'retry_knowledge_ingestion',
] as const;
