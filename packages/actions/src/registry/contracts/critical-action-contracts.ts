import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  NON_EMPTY_STRING_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const OUTPUT_TYPE = enumSchema([
  'article',
  'linkedin-article',
  'newsletter',
  'x-article',
] as const);
const RETENTION_POLICY = enumSchema(['terminal', 'ttl'] as const);

const YOUTUBE_SOURCE = closedObjectSchema(
  {
    title: NON_EMPTY_STRING_SCHEMA,
    videoId: NON_EMPTY_STRING_SCHEMA,
    youtubeUrl: NON_EMPTY_STRING_SCHEMA,
  },
  ['title', 'videoId', 'youtubeUrl'],
);
const SOURCE_ARTIFACT_METADATA = closedObjectSchema(
  {
    resolvedUrl: NON_EMPTY_STRING_SCHEMA,
    sourceTitle: NON_EMPTY_STRING_SCHEMA,
    videoId: NON_EMPTY_STRING_SCHEMA,
    youtubeUrl: NON_EMPTY_STRING_SCHEMA,
  },
  ['resolvedUrl', 'sourceTitle', 'videoId', 'youtubeUrl'],
);
const EXTRACTED_MEDIA = closedObjectSchema(
  {
    audioStorageKey: NON_EMPTY_STRING_SCHEMA,
    audioUrl: NON_EMPTY_STRING_SCHEMA,
    sourceArtifactMetadata: SOURCE_ARTIFACT_METADATA,
    sourceStorageKey: NON_EMPTY_STRING_SCHEMA,
    title: NON_EMPTY_STRING_SCHEMA,
    videoId: NON_EMPTY_STRING_SCHEMA,
    youtubeUrl: NON_EMPTY_STRING_SCHEMA,
  },
  [
    'audioStorageKey',
    'audioUrl',
    'sourceArtifactMetadata',
    'sourceStorageKey',
    'title',
    'videoId',
    'youtubeUrl',
  ],
);
const TRANSCRIPT = closedObjectSchema(
  {
    language: STRING_SCHEMA,
    title: NON_EMPTY_STRING_SCHEMA,
    transcript: NON_EMPTY_STRING_SCHEMA,
    videoId: NON_EMPTY_STRING_SCHEMA,
    youtubeUrl: NON_EMPTY_STRING_SCHEMA,
  },
  ['language', 'title', 'transcript', 'videoId', 'youtubeUrl'],
);
const LONG_FORM_DOCUMENT = closedObjectSchema(
  {
    content: NON_EMPTY_STRING_SCHEMA,
    outputType: OUTPUT_TYPE,
    summary: NON_EMPTY_STRING_SCHEMA,
    title: NON_EMPTY_STRING_SCHEMA,
    videoId: NON_EMPTY_STRING_SCHEMA,
    youtubeUrl: NON_EMPTY_STRING_SCHEMA,
  },
  ['content', 'outputType', 'summary', 'title', 'videoId', 'youtubeUrl'],
);
const ARTIFACT_REFERENCE = closedObjectSchema(
  {
    artifactId: NON_EMPTY_STRING_SCHEMA,
    expiresAt: { format: 'date-time', type: 'string' },
    state: NON_EMPTY_STRING_SCHEMA,
  },
  ['artifactId', 'expiresAt', 'state'],
);
const CLEANUP_RESULT = closedObjectSchema(
  {
    deleted: INTEGER_SCHEMA,
    failed: INTEGER_SCHEMA,
    skipped: INTEGER_SCHEMA,
  },
  ['deleted', 'failed', 'skipped'],
);
const CLEANUP_SCOPE = closedObjectSchema(
  {
    executionId: NON_EMPTY_STRING_SCHEMA,
    organizationId: NON_EMPTY_STRING_SCHEMA,
    userId: NON_EMPTY_STRING_SCHEMA,
  },
  ['executionId', 'organizationId', 'userId'],
);
const CHILD_PROVENANCE = closedObjectSchema(
  {
    executionId: NON_EMPTY_STRING_SCHEMA,
    idempotencyKey: NON_EMPTY_STRING_SCHEMA,
    nodeId: NON_EMPTY_STRING_SCHEMA,
    workflowId: NON_EMPTY_STRING_SCHEMA,
    workflowLabel: NON_EMPTY_STRING_SCHEMA,
  },
  ['executionId', 'workflowId', 'workflowLabel'],
);
const CHILD_RESULT = {
  oneOf: [
    closedObjectSchema(
      {
        index: INTEGER_SCHEMA,
        provenance: CHILD_PROVENANCE,
        result: JSON_DOCUMENT_SCHEMA,
      },
      ['index', 'provenance', 'result'],
    ),
    closedObjectSchema(
      { index: INTEGER_SCHEMA, jobId: NON_EMPTY_STRING_SCHEMA },
      ['index', 'jobId'],
    ),
    closedObjectSchema(
      {
        error: NON_EMPTY_STRING_SCHEMA,
        executionId: NON_EMPTY_STRING_SCHEMA,
        index: INTEGER_SCHEMA,
        status: enumSchema(['failed'] as const),
      },
      ['error', 'index', 'status'],
    ),
  ],
};
const FOR_EACH_OUTPUT = closedObjectSchema(
  { count: INTEGER_SCHEMA, results: arraySchema(CHILD_RESULT) },
  ['count', 'results'],
);
const FOR_EACH_INPUT = closedObjectSchema(
  {
    baseInput: JSON_DOCUMENT_SCHEMA,
    childWorkflowId: NON_EMPTY_STRING_SCHEMA,
    childWorkflowVersionId: NON_EMPTY_STRING_SCHEMA,
    failureMode: enumSchema(['fail-fast', 'collect'] as const),
    initialDelayMs: { minimum: 0, type: 'integer' },
    interItemDelayMs: { minimum: 0, type: 'integer' },
    itemInputKey: NON_EMPTY_STRING_SCHEMA,
    items: arraySchema(JSON_DOCUMENT_SCHEMA),
    maxConcurrency: { minimum: 1, type: 'integer' },
    mode: enumSchema(['await', 'scheduled'] as const),
    request: JSON_DOCUMENT_SCHEMA,
  },
  ['childWorkflowId', 'items'],
);
const DYNAMIC_CHILD_ITEM = closedObjectSchema(
  {
    canonicalId: {
      minLength: 1,
      pattern: '^agent\\.tool\\.[A-Za-z0-9._-]+$',
      type: 'string',
    },
    idempotencyKey: NON_EMPTY_STRING_SCHEMA,
    inputValues: JSON_DOCUMENT_SCHEMA,
    workflowVersionId: NON_EMPTY_STRING_SCHEMA,
  },
  ['canonicalId', 'idempotencyKey', 'inputValues', 'workflowVersionId'],
);
const DYNAMIC_CHILD_RESULT = {
  oneOf: [
    closedObjectSchema(
      {
        executionId: NON_EMPTY_STRING_SCHEMA,
        index: INTEGER_SCHEMA,
        result: JSON_DOCUMENT_SCHEMA,
        workflowId: NON_EMPTY_STRING_SCHEMA,
      },
      ['executionId', 'index', 'result', 'workflowId'],
    ),
    closedObjectSchema(
      {
        error: NON_EMPTY_STRING_SCHEMA,
        executionId: NON_EMPTY_STRING_SCHEMA,
        index: INTEGER_SCHEMA,
        status: enumSchema(['failed'] as const),
      },
      ['error', 'index', 'status'],
    ),
  ],
};

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'long-form.persist-output': {
    inputSchema: closedObjectSchema(
      {
        audioArtifact: ARTIFACT_REFERENCE,
        brandId: NON_EMPTY_STRING_SCHEMA,
        document: LONG_FORM_DOCUMENT,
        persistence: enumSchema(['account', 'preview'] as const),
        sourceArtifact: ARTIFACT_REFERENCE,
      },
      ['document', 'persistence'],
    ),
    outputSchema: closedObjectSchema(
      {
        content: NON_EMPTY_STRING_SCHEMA,
        contentId: NON_EMPTY_STRING_SCHEMA,
        outputType: OUTPUT_TYPE,
        sourceArtifactId: NON_EMPTY_STRING_SCHEMA,
        summary: NON_EMPTY_STRING_SCHEMA,
        title: NON_EMPTY_STRING_SCHEMA,
        videoId: NON_EMPTY_STRING_SCHEMA,
        youtubeUrl: NON_EMPTY_STRING_SCHEMA,
      },
      ['content', 'outputType', 'summary', 'title', 'videoId', 'youtubeUrl'],
    ),
  },
  'long-form.transform-text': {
    inputSchema: closedObjectSchema(
      { outputType: OUTPUT_TYPE, transcript: TRANSCRIPT },
      ['outputType', 'transcript'],
    ),
    outputSchema: LONG_FORM_DOCUMENT,
  },
  'workflow.artifact.cleanup': {
    inputSchema: closedObjectSchema(
      {
        reason: enumSchema(['terminal', 'ttl'] as const),
        targetExecutionId: NON_EMPTY_STRING_SCHEMA,
      },
      ['reason', 'targetExecutionId'],
    ),
    outputSchema: CLEANUP_RESULT,
  },
  'workflow.artifact.cleanup-expired-scope': {
    inputSchema: closedObjectSchema({ request: CLEANUP_SCOPE }, ['request']),
    outputSchema: CLEANUP_RESULT,
  },
  'workflow.artifact.discover-expired': {
    inputSchema: closedObjectSchema({ request: JSON_DOCUMENT_SCHEMA }, [
      'request',
    ]),
    outputSchema: closedObjectSchema({ items: arraySchema(CLEANUP_SCOPE) }, [
      'items',
    ]),
  },
  'workflow.artifact.promote': {
    inputSchema: closedObjectSchema(
      {
        artifactId: NON_EMPTY_STRING_SCHEMA,
        targetId: NON_EMPTY_STRING_SCHEMA,
        targetType: NON_EMPTY_STRING_SCHEMA,
      },
      ['artifactId', 'targetId', 'targetType'],
    ),
    outputSchema: closedObjectSchema(
      {
        artifactId: NON_EMPTY_STRING_SCHEMA,
        state: { const: 'PROMOTED', type: 'string' },
        targetId: NON_EMPTY_STRING_SCHEMA,
        targetType: NON_EMPTY_STRING_SCHEMA,
      },
      ['artifactId', 'state', 'targetId', 'targetType'],
    ),
  },
  'workflow.artifact.register': {
    inputSchema: closedObjectSchema(
      {
        kind: NON_EMPTY_STRING_SCHEMA,
        metadata: JSON_DOCUMENT_SCHEMA,
        producerNodeId: NON_EMPTY_STRING_SCHEMA,
        retentionPolicy: RETENTION_POLICY,
        storageKey: NON_EMPTY_STRING_SCHEMA,
        storageProvider: NON_EMPTY_STRING_SCHEMA,
      },
      ['kind', 'producerNodeId', 'storageKey'],
    ),
    outputSchema: ARTIFACT_REFERENCE,
  },
  'workflow.collect-output': {
    inputSchema: JSON_DOCUMENT_SCHEMA,
    outputSchema: JSON_DOCUMENT_SCHEMA,
  },
  'workflow.for-each': {
    inputSchema: FOR_EACH_INPUT,
    outputSchema: FOR_EACH_OUTPUT,
  },
  'workflow.for-each-dynamic': {
    inputSchema: closedObjectSchema(
      {
        baseInput: JSON_DOCUMENT_SCHEMA,
        failureMode: enumSchema(['collect', 'fail-fast'] as const),
        itemInputKey: NON_EMPTY_STRING_SCHEMA,
        items: arraySchema(DYNAMIC_CHILD_ITEM),
        maxConcurrency: { minimum: 1, type: 'integer' },
      },
      ['items'],
    ),
    outputSchema: closedObjectSchema(
      {
        count: INTEGER_SCHEMA,
        results: arraySchema(DYNAMIC_CHILD_RESULT),
      },
      ['count', 'results'],
    ),
  },
  'workflow.for-each-tenant': {
    inputSchema: FOR_EACH_INPUT,
    outputSchema: FOR_EACH_OUTPUT,
  },
  'workflow.run-child': {
    inputSchema: closedObjectSchema(
      {
        baseInput: JSON_DOCUMENT_SCHEMA,
        childWorkflowId: NON_EMPTY_STRING_SCHEMA,
        dto: JSON_DOCUMENT_SCHEMA,
        item: JSON_DOCUMENT_SCHEMA,
        request: JSON_DOCUMENT_SCHEMA,
      },
      ['childWorkflowId'],
    ),
    outputSchema: JSON_DOCUMENT_SCHEMA,
  },
  'youtube.create-source-library-asset': {
    inputSchema: closedObjectSchema(
      {
        artifactId: NON_EMPTY_STRING_SCHEMA,
        ingredientId: NON_EMPTY_STRING_SCHEMA,
      },
      ['artifactId', 'ingredientId'],
    ),
    outputSchema: closedObjectSchema(
      {
        artifactId: NON_EMPTY_STRING_SCHEMA,
        ingredientId: NON_EMPTY_STRING_SCHEMA,
        status: { const: 'linked', type: 'string' },
      },
      ['artifactId', 'ingredientId', 'status'],
    ),
  },
  'youtube.extract-audio': {
    inputSchema: closedObjectSchema({ source: YOUTUBE_SOURCE }, ['source']),
    outputSchema: EXTRACTED_MEDIA,
  },
  'youtube.plan-source-library-asset': {
    inputSchema: closedObjectSchema({ artifactId: NON_EMPTY_STRING_SCHEMA }, [
      'artifactId',
    ]),
    outputSchema: closedObjectSchema(
      {
        artifactId: NON_EMPTY_STRING_SCHEMA,
        ingredientId: NON_EMPTY_STRING_SCHEMA,
      },
      ['artifactId', 'ingredientId'],
    ),
  },
  'youtube.resolve-source': {
    inputSchema: closedObjectSchema({ youtubeUrl: NON_EMPTY_STRING_SCHEMA }, [
      'youtubeUrl',
    ]),
    outputSchema: YOUTUBE_SOURCE,
  },
  'youtube.transcribe-audio': {
    inputSchema: closedObjectSchema(
      {
        audioArtifact: ARTIFACT_REFERENCE,
        media: EXTRACTED_MEDIA,
        sourceArtifact: ARTIFACT_REFERENCE,
      },
      ['media'],
    ),
    outputSchema: TRANSCRIPT,
  },
};

export function getCriticalActionContract(
  actionId: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[actionId];
}
