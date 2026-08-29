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

const SOURCE_ARTIFACT = closedObjectSchema(
  {
    contentType: STRING_SCHEMA,
    durationSeconds: NUMBER_SCHEMA,
    mediaUrl: STRING_SCHEMA,
    storageKey: STRING_SCHEMA,
  },
  ['contentType', 'mediaUrl'],
);
const STORED_HIGHLIGHT = closedObjectSchema(
  {
    clip_type: STRING_SCHEMA,
    end_time: NUMBER_SCHEMA,
    id: STRING_SCHEMA,
    start_time: NUMBER_SCHEMA,
    summary: STRING_SCHEMA,
    tags: arraySchema(STRING_SCHEMA),
    title: STRING_SCHEMA,
    virality_score: NUMBER_SCHEMA,
  },
  [
    'clip_type',
    'end_time',
    'id',
    'start_time',
    'summary',
    'tags',
    'title',
    'virality_score',
  ],
);
const TRANSCRIPT_SEGMENT = closedObjectSchema(
  { end: NUMBER_SCHEMA, start: NUMBER_SCHEMA, text: STRING_SCHEMA },
  ['end', 'start', 'text'],
);
const PREVIEW_STATUS = enumSchema([
  'available',
  'failed',
  'generating',
  'queued',
  'ready',
] as const);
const STORED_PREVIEW = closedObjectSchema(
  {
    jobId: STRING_SCHEMA,
    recommendationId: STRING_SCHEMA,
    s3Key: STRING_SCHEMA,
    status: PREVIEW_STATUS,
    url: STRING_SCHEMA,
  },
  ['status'],
);
const SESSION_STATUS = enumSchema([
  'analyzing',
  'claimed',
  'failed',
  'queued',
  'ready',
] as const);
const STORED_SESSION = closedObjectSchema(
  {
    createdAt: STRING_SCHEMA,
    error: STRING_SCHEMA,
    expiresAt: STRING_SCHEMA,
    highlights: arraySchema(STORED_HIGHLIGHT),
    id: STRING_SCHEMA,
    language: STRING_SCHEMA,
    preview: STORED_PREVIEW,
    progress: NUMBER_SCHEMA,
    sourceArtifact: SOURCE_ARTIFACT,
    sourceFingerprint: STRING_SCHEMA,
    sourceVideoS3Key: STRING_SCHEMA,
    sourceVideoUrl: STRING_SCHEMA,
    status: SESSION_STATUS,
    transcriptSegments: arraySchema(TRANSCRIPT_SEGMENT),
    transcriptSrt: STRING_SCHEMA,
    transcriptText: STRING_SCHEMA,
  },
  [
    'createdAt',
    'expiresAt',
    'highlights',
    'id',
    'language',
    'preview',
    'progress',
    'sourceFingerprint',
    'sourceVideoUrl',
    'status',
    'transcriptSegments',
  ],
);
const PUBLIC_SOURCE = closedObjectSchema(
  {
    title: STRING_SCHEMA,
    videoId: STRING_SCHEMA,
    youtubeUrl: STRING_SCHEMA,
  },
  ['title', 'videoId', 'youtubeUrl'],
);
const ANALYSIS_JOB = closedObjectSchema(
  {
    highlightFallback: { const: 'deterministic', type: 'string' },
    highlightModel: STRING_SCHEMA,
    language: STRING_SCHEMA,
    maxClips: NUMBER_SCHEMA,
    minViralityScore: NUMBER_SCHEMA,
    orgId: STRING_SCHEMA,
    projectId: STRING_SCHEMA,
    userId: STRING_SCHEMA,
    youtubeUrl: STRING_SCHEMA,
  },
  [
    'highlightFallback',
    'highlightModel',
    'language',
    'maxClips',
    'minViralityScore',
    'orgId',
    'projectId',
    'userId',
    'youtubeUrl',
  ],
);
const SESSION_ENVELOPE = closedObjectSchema(
  {
    analysisJobs: arraySchema(ANALYSIS_JOB),
    idempotencyKey: STRING_SCHEMA,
    isNew: BOOLEAN_SCHEMA,
    previewToken: STRING_SCHEMA,
    session: STORED_SESSION,
    source: PUBLIC_SOURCE,
  },
  ['analysisJobs', 'isNew', 'previewToken', 'session', 'source'],
);
const PREVIEW_ENVELOPE = closedObjectSchema(
  {
    highlight: STORED_HIGHLIGHT,
    jobId: STRING_SCHEMA,
    previewToken: STRING_SCHEMA,
    reserved: STORED_SESSION,
  },
  ['highlight', 'jobId', 'previewToken', 'reserved'],
);
const PUBLIC_SESSION = closedObjectSchema(
  {
    errorCode: STRING_SCHEMA,
    expiresAt: STRING_SCHEMA,
    id: STRING_SCHEMA,
    preview: closedObjectSchema(
      {
        recommendationId: STRING_SCHEMA,
        status: PREVIEW_STATUS,
        url: STRING_SCHEMA,
      },
      ['status'],
    ),
    previewToken: STRING_SCHEMA,
    progress: NUMBER_SCHEMA,
    recommendations: arraySchema(
      closedObjectSchema(
        {
          clipType: STRING_SCHEMA,
          endTime: NUMBER_SCHEMA,
          id: STRING_SCHEMA,
          score: NUMBER_SCHEMA,
          startTime: NUMBER_SCHEMA,
          summary: STRING_SCHEMA,
          tags: arraySchema(STRING_SCHEMA),
          title: STRING_SCHEMA,
        },
        [
          'clipType',
          'endTime',
          'id',
          'score',
          'startTime',
          'summary',
          'tags',
          'title',
        ],
      ),
    ),
    status: SESSION_STATUS,
    transcript: arraySchema(TRANSCRIPT_SEGMENT),
  },
  [
    'expiresAt',
    'id',
    'preview',
    'previewToken',
    'progress',
    'recommendations',
    'status',
    'transcript',
  ],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'youtube.clip.create-session': {
    inputSchema: closedObjectSchema(
      { idempotencyKey: STRING_SCHEMA, source: PUBLIC_SOURCE },
      ['source'],
    ),
    outputSchema: SESSION_ENVELOPE,
  },
  'youtube.clip.dispatch-preview': {
    inputSchema: closedObjectSchema({ previewEnvelope: PREVIEW_ENVELOPE }, [
      'previewEnvelope',
    ]),
    outputSchema: PUBLIC_SESSION,
  },
  'youtube.clip.read-session': {
    inputSchema: closedObjectSchema(
      {
        analysisDispatch: JSON_DOCUMENT_SCHEMA,
        previewToken: STRING_SCHEMA,
      },
      ['previewToken'],
    ),
    outputSchema: PUBLIC_SESSION,
  },
  'youtube.clip.release-session': {
    inputSchema: closedObjectSchema({ failure: JSON_DOCUMENT_SCHEMA }, [
      'failure',
    ]),
    outputSchema: closedObjectSchema(
      { previewToken: STRING_SCHEMA, released: BOOLEAN_SCHEMA },
      ['released'],
    ),
  },
  'youtube.clip.reserve-preview': {
    inputSchema: closedObjectSchema(
      { previewToken: STRING_SCHEMA, recommendationId: STRING_SCHEMA },
      ['previewToken'],
    ),
    outputSchema: PREVIEW_ENVELOPE,
  },
};

export function getYoutubeClipActionContract(
  actionId: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[actionId];
}
