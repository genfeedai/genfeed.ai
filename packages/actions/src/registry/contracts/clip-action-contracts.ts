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

const CLIP_SOURCE_ARTIFACT = closedObjectSchema(
  {
    contentType: STRING_SCHEMA,
    durationSeconds: NUMBER_SCHEMA,
    mediaUrl: STRING_SCHEMA,
    storageKey: STRING_SCHEMA,
  },
  ['contentType', 'mediaUrl'],
);
const CLIP_SOURCE_FAILURE = closedObjectSchema(
  {
    code: STRING_SCHEMA,
    message: STRING_SCHEMA,
    retryable: BOOLEAN_SCHEMA,
  },
  ['code', 'message', 'retryable'],
);
const CLIP_SOURCE = closedObjectSchema(
  {
    artifact: CLIP_SOURCE_ARTIFACT,
    contentType: STRING_SCHEMA,
    durationSeconds: NUMBER_SCHEMA,
    failure: nullableSchema(CLIP_SOURCE_FAILURE),
    filename: STRING_SCHEMA,
    fingerprint: STRING_SCHEMA,
    flow: enumSchema(['quick', 'review'] as const),
    ingredientId: STRING_SCHEMA,
    jobId: STRING_SCHEMA,
    kind: enumSchema(['upload', 'youtube'] as const),
    maxRetries: NUMBER_SCHEMA,
    retryCount: NUMBER_SCHEMA,
    schemaVersion: { const: 1, type: 'number' },
    sizeBytes: NUMBER_SCHEMA,
    status: enumSchema([
      'completed',
      'downloading',
      'extracting',
      'failed',
      'queued',
      'ready-for-transcription',
      'uploading',
      'validating',
    ] as const),
    updatedAt: STRING_SCHEMA,
  },
  [
    'fingerprint',
    'flow',
    'kind',
    'maxRetries',
    'retryCount',
    'schemaVersion',
    'status',
    'updatedAt',
  ],
);
const FACTORY_GENERATION_REFERENCE = closedObjectSchema(
  {
    assetId: STRING_SCHEMA,
    description: STRING_SCHEMA,
    role: enumSchema([
      'character',
      'composition',
      'first_frame',
      'last_frame',
      'product',
      'reference_video',
      'style',
      'subject',
    ] as const),
    url: STRING_SCHEMA,
  },
  ['assetId', 'role', 'url'],
);
const ANALYSIS_REQUEST_PROPERTIES = {
  avatarId: STRING_SCHEMA,
  avatarProvider: enumSchema(['argil', 'genfeedai', 'heygen'] as const),
  highlightFallback: { const: 'deterministic', type: 'string' },
  highlightModel: STRING_SCHEMA,
  language: STRING_SCHEMA,
  maxClips: INTEGER_SCHEMA,
  minViralityScore: NUMBER_SCHEMA,
  mode: enumSchema(['avatar', 'raw-cut'] as const),
  orgId: STRING_SCHEMA,
  projectId: STRING_SCHEMA,
  referenceImageUrl: STRING_SCHEMA,
  runReferences: arraySchema(FACTORY_GENERATION_REFERENCE),
  source: CLIP_SOURCE,
  userId: STRING_SCHEMA,
  voiceId: STRING_SCHEMA,
  youtubeUrl: STRING_SCHEMA,
} as const;
const ANALYSIS_REQUEST_REQUIRED = [
  'language',
  'maxClips',
  'minViralityScore',
  'orgId',
  'projectId',
  'userId',
  'youtubeUrl',
] as const;
const ANALYSIS_REQUEST = closedObjectSchema(
  ANALYSIS_REQUEST_PROPERTIES,
  ANALYSIS_REQUEST_REQUIRED,
);
const CLIP_HIGHLIGHT_PROPERTIES = {
  clip_type: STRING_SCHEMA,
  end_time: NUMBER_SCHEMA,
  id: STRING_SCHEMA,
  start_time: NUMBER_SCHEMA,
  summary: STRING_SCHEMA,
  tags: arraySchema(STRING_SCHEMA),
  title: STRING_SCHEMA,
  virality_score: NUMBER_SCHEMA,
} as const;
const CLIP_HIGHLIGHT_REQUIRED = [
  'clip_type',
  'end_time',
  'start_time',
  'summary',
  'tags',
  'title',
  'virality_score',
] as const;
const GENERATION_HIGHLIGHT = closedObjectSchema(
  CLIP_HIGHLIGHT_PROPERTIES,
  CLIP_HIGHLIGHT_REQUIRED,
);
const ANALYZED_HIGHLIGHT = closedObjectSchema(CLIP_HIGHLIGHT_PROPERTIES, [
  ...CLIP_HIGHLIGHT_REQUIRED,
  'id',
]);
const TRANSCRIPT_WORD = closedObjectSchema(
  { end: NUMBER_SCHEMA, start: NUMBER_SCHEMA, word: STRING_SCHEMA },
  ['end', 'start', 'word'],
);
const TRANSCRIPT_SEGMENT = closedObjectSchema(
  {
    end: NUMBER_SCHEMA,
    start: NUMBER_SCHEMA,
    text: STRING_SCHEMA,
    words: arraySchema(TRANSCRIPT_WORD),
  },
  ['end', 'start', 'text'],
);
const TRANSCRIPTION = closedObjectSchema(
  {
    duration: NUMBER_SCHEMA,
    language: STRING_SCHEMA,
    segments: arraySchema(TRANSCRIPT_SEGMENT),
    srt: STRING_SCHEMA,
    text: STRING_SCHEMA,
  },
  ['duration', 'language', 'segments', 'srt', 'text'],
);
const PREPARED_PROPERTIES = {
  audioUrl: STRING_SCHEMA,
  data: ANALYSIS_REQUEST,
  sourceArtifact: CLIP_SOURCE_ARTIFACT,
  sourceUrl: STRING_SCHEMA,
} as const;
const PREPARED_REQUIRED = ['audioUrl', 'data', 'sourceUrl'] as const;
const PREPARED = closedObjectSchema(PREPARED_PROPERTIES, PREPARED_REQUIRED);
const TRANSCRIBED_PROPERTIES = {
  ...PREPARED_PROPERTIES,
  transcription: TRANSCRIPTION,
} as const;
const TRANSCRIBED_REQUIRED = [...PREPARED_REQUIRED, 'transcription'] as const;
const TRANSCRIBED = closedObjectSchema(
  TRANSCRIBED_PROPERTIES,
  TRANSCRIBED_REQUIRED,
);
const HIGHLIGHTED_PROPERTIES = {
  ...TRANSCRIBED_PROPERTIES,
  highlights: arraySchema(ANALYZED_HIGHLIGHT),
} as const;
const HIGHLIGHTED_REQUIRED = [...TRANSCRIBED_REQUIRED, 'highlights'] as const;
const HIGHLIGHTED = closedObjectSchema(
  HIGHLIGHTED_PROPERTIES,
  HIGHLIGHTED_REQUIRED,
);
const REFERENCE_FRAME_DIAGNOSTIC = closedObjectSchema(
  {
    candidateId: STRING_SCHEMA,
    code: STRING_SCHEMA,
    message: STRING_SCHEMA,
    severity: enumSchema(['error', 'info', 'warning'] as const),
  },
  ['code', 'message', 'severity'],
);
const REFERENCE_FRAME_CANDIDATE = closedObjectSchema(
  {
    assetId: STRING_SCHEMA,
    diagnostics: arraySchema(REFERENCE_FRAME_DIAGNOSTIC),
    height: NUMBER_SCHEMA,
    id: STRING_SCHEMA,
    mimeType: STRING_SCHEMA,
    status: enumSchema(['available', 'failed', 'pending'] as const),
    storageKey: STRING_SCHEMA,
    timestampSeconds: NUMBER_SCHEMA,
    url: STRING_SCHEMA,
    width: NUMBER_SCHEMA,
  },
  ['diagnostics', 'id', 'status', 'timestampSeconds'],
);
const REFERENCE_FRAMES = closedObjectSchema(
  {
    candidates: arraySchema(REFERENCE_FRAME_CANDIDATE),
    diagnostics: arraySchema(REFERENCE_FRAME_DIAGNOSTIC),
    schemaVersion: { const: 1, type: 'number' },
    selectedCandidateId: nullableSchema(STRING_SCHEMA),
    status: enumSchema([
      'partial',
      'pending',
      'ready',
      'selected',
      'unavailable',
    ] as const),
  },
  [
    'candidates',
    'diagnostics',
    'schemaVersion',
    'selectedCandidateId',
    'status',
  ],
);
const REFERENCED = closedObjectSchema(
  { ...HIGHLIGHTED_PROPERTIES, referenceFrames: REFERENCE_FRAMES },
  [...HIGHLIGHTED_REQUIRED, 'referenceFrames'],
);

const REFERENCE_PROVENANCE = closedObjectSchema(
  {
    application: closedObjectSchema(
      {
        mode: enumSchema(['avatar', 'raw-cut'] as const),
        nativeField: STRING_SCHEMA,
        provider: STRING_SCHEMA,
        reason: STRING_SCHEMA,
        state: enumSchema(['applied', 'degraded'] as const),
      },
      ['mode', 'provider', 'state'],
    ),
    schemaVersion: { const: 1, type: 'number' },
    source: closedObjectSchema(
      {
        assetId: STRING_SCHEMA,
        candidateId: STRING_SCHEMA,
        mimeType: STRING_SCHEMA,
        storageKey: STRING_SCHEMA,
        timestampSeconds: NUMBER_SCHEMA,
      },
      ['candidateId', 'timestampSeconds'],
    ),
  },
  ['application', 'schemaVersion', 'source'],
);
const GENERATION_REQUEST_PROPERTIES = {
  avatarId: STRING_SCHEMA,
  highlights: arraySchema(GENERATION_HIGHLIGHT),
  hookApprovalRequired: BOOLEAN_SCHEMA,
  mode: enumSchema(['avatar', 'raw-cut'] as const),
  orgId: STRING_SCHEMA,
  projectId: STRING_SCHEMA,
  provider: enumSchema(['argil', 'genfeedai', 'heygen'] as const),
  referenceImageUrl: STRING_SCHEMA,
  referenceProvenance: REFERENCE_PROVENANCE,
  resultIndex: NUMBER_SCHEMA,
  room: STRING_SCHEMA,
  runReferences: arraySchema(FACTORY_GENERATION_REFERENCE),
  sourceVideoS3Key: STRING_SCHEMA,
  sourceVideoUrl: STRING_SCHEMA,
  transcriptSegments: arraySchema(TRANSCRIPT_SEGMENT),
  transcriptText: STRING_SCHEMA,
  userId: STRING_SCHEMA,
  voiceId: STRING_SCHEMA,
} as const;
const GENERATION_REQUEST_REQUIRED = [
  'highlights',
  'orgId',
  'projectId',
  'userId',
] as const;
const GENERATION_REQUEST = closedObjectSchema(
  GENERATION_REQUEST_PROPERTIES,
  GENERATION_REQUEST_REQUIRED,
);
const REVIEW_CONTEXT = closedObjectSchema(
  {
    attempt: NUMBER_SCHEMA,
    feedback: STRING_SCHEMA,
    lastAction: enumSchema(['approve', 'reject', 'request_changes'] as const),
  },
  ['attempt'],
);
const GENERATION_RESULT_PROPERTIES = {
  awaitingHookApproval: BOOLEAN_SCHEMA,
  clipResultIds: arraySchema(STRING_SCHEMA),
  completedClipCount: NUMBER_SCHEMA,
  providerJobIds: arraySchema(STRING_SCHEMA),
  queuedClipCount: NUMBER_SCHEMA,
} as const;
const GENERATION_RESULT_REQUIRED = [
  'clipResultIds',
  'providerJobIds',
  'queuedClipCount',
] as const;
const GENERATION_RESULT = closedObjectSchema(
  GENERATION_RESULT_PROPERTIES,
  GENERATION_RESULT_REQUIRED,
);
const GENERATION_PLAN = closedObjectSchema(
  {
    baseInput: closedObjectSchema({ request: GENERATION_REQUEST }, ['request']),
    hookItems: arraySchema(INTEGER_SCHEMA),
    hookReviewRequired: BOOLEAN_SCHEMA,
    remainingItems: arraySchema(INTEGER_SCHEMA),
  },
  ['baseInput', 'hookItems', 'hookReviewRequired', 'remainingItems'],
);

const CONTINUITY_DIMENSION = closedObjectSchema(
  {
    confidence: nullableSchema(NUMBER_SCHEMA),
    summary: STRING_SCHEMA,
    verdict: enumSchema([
      'consistent',
      'drift',
      'not_assessed',
      'uncertain',
    ] as const),
  },
  ['confidence', 'summary', 'verdict'],
);
const CONTINUITY_REPORT = closedObjectSchema(
  {
    clips: arraySchema(
      closedObjectSchema(
        {
          character: CONTINUITY_DIMENSION,
          clipId: STRING_SCHEMA,
          clipIndex: NUMBER_SCHEMA,
          errors: arraySchema(
            closedObjectSchema(
              {
                code: enumSchema([
                  'FRAME_EXTRACTION_FAILED',
                  'MODEL_FAILED',
                  'MODEL_RESPONSE_INVALID',
                ] as const),
                message: STRING_SCHEMA,
              },
              ['code', 'message'],
            ),
          ),
          evidenceFrames: arraySchema(
            closedObjectSchema(
              {
                kind: enumSchema(['contact_sheet', 'frame'] as const),
                url: STRING_SCHEMA,
              },
              ['kind', 'url'],
            ),
          ),
          outfit: CONTINUITY_DIMENSION,
          product: CONTINUITY_DIMENSION,
          videoUrl: STRING_SCHEMA,
        },
        [
          'character',
          'clipId',
          'clipIndex',
          'errors',
          'evidenceFrames',
          'outfit',
          'product',
        ],
      ),
    ),
    completedAt: STRING_SCHEMA,
    modelKey: STRING_SCHEMA,
    projectId: STRING_SCHEMA,
    referenceAssetIds: closedObjectSchema(
      {
        character: arraySchema(STRING_SCHEMA),
        product: arraySchema(STRING_SCHEMA),
      },
      ['character', 'product'],
    ),
    runId: STRING_SCHEMA,
    schemaVersion: { const: 1, type: 'number' },
    skipReason: enumSchema([
      'canonical_references_unavailable',
      'continuity_resolver_unavailable',
      'vision_model_unavailable',
    ] as const),
    status: enumSchema(['completed', 'partial', 'skipped'] as const),
    summary: closedObjectSchema(
      {
        assessedClipCount: NUMBER_SCHEMA,
        driftClipCount: NUMBER_SCHEMA,
        errorClipCount: NUMBER_SCHEMA,
        totalClipCount: NUMBER_SCHEMA,
      },
      [
        'assessedClipCount',
        'driftClipCount',
        'errorClipCount',
        'totalClipCount',
      ],
    ),
  },
  [
    'clips',
    'completedAt',
    'projectId',
    'referenceAssetIds',
    'runId',
    'schemaVersion',
    'status',
    'summary',
  ],
);
const HANDOFF_INPUT = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    clipResultId: STRING_SCHEMA,
    projectId: STRING_SCHEMA,
  },
  ['clipResultId', 'projectId'],
);

const planInput = (): ActionJsonSchema => ({
  oneOf: [
    closedObjectSchema(
      { highlighted: HIGHLIGHTED, reviewContext: REVIEW_CONTEXT },
      ['highlighted'],
    ),
    closedObjectSchema(
      { request: GENERATION_REQUEST, reviewContext: REVIEW_CONTEXT },
      ['request'],
    ),
  ],
});

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'clip.analysis.detect-highlights': {
    inputSchema: closedObjectSchema({ transcribed: TRANSCRIBED }, [
      'transcribed',
    ]),
    outputSchema: HIGHLIGHTED,
  },
  'clip.analysis.extract-reference-frames': {
    inputSchema: closedObjectSchema({ highlighted: HIGHLIGHTED }, [
      'highlighted',
    ]),
    outputSchema: REFERENCED,
  },
  'clip.analysis.fail': {
    inputSchema: closedObjectSchema(
      { job: ANALYSIS_REQUEST, workflowError: STRING_SCHEMA },
      ['job', 'workflowError'],
    ),
    outputSchema: closedObjectSchema(
      { status: { const: 'failed', type: 'string' } },
      ['status'],
    ),
  },
  'clip.analysis.persist': {
    inputSchema: closedObjectSchema({ referenced: REFERENCED }, ['referenced']),
    outputSchema: closedObjectSchema({ sourceArtifact: CLIP_SOURCE_ARTIFACT }),
  },
  'clip.analysis.prepare-source': {
    inputSchema: closedObjectSchema({ job: ANALYSIS_REQUEST }, ['job']),
    outputSchema: PREPARED,
  },
  'clip.analysis.transcribe': {
    inputSchema: closedObjectSchema({ prepared: PREPARED }, ['prepared']),
    outputSchema: TRANSCRIBED,
  },
  'clip.continuity.begin': {
    inputSchema: closedObjectSchema({ projectId: STRING_SCHEMA }, [
      'projectId',
    ]),
    outputSchema: closedObjectSchema(
      {
        projectId: STRING_SCHEMA,
        status: { const: 'running', type: 'string' },
      },
      ['projectId', 'status'],
    ),
  },
  'clip.continuity.fail': {
    inputSchema: closedObjectSchema({ projectId: STRING_SCHEMA }, [
      'projectId',
    ]),
    outputSchema: closedObjectSchema(
      {
        projectId: STRING_SCHEMA,
        status: { const: 'failed', type: 'string' },
      },
      ['projectId', 'status'],
    ),
  },
  'clip.continuity.persist-report': {
    inputSchema: closedObjectSchema(
      {
        clipDescriptors: arraySchema(
          closedObjectSchema(
            {
              id: STRING_SCHEMA,
              qaIndex: NUMBER_SCHEMA,
              status: STRING_SCHEMA,
              videoUrl: STRING_SCHEMA,
            },
            ['id', 'status'],
          ),
        ),
        generationWorkflowExecutionId: STRING_SCHEMA,
        projectId: STRING_SCHEMA,
        qaBatch: JSON_DOCUMENT_SCHEMA,
        referenceAssetIds: closedObjectSchema(
          {
            character: arraySchema(STRING_SCHEMA),
            product: arraySchema(STRING_SCHEMA),
          },
          ['character', 'product'],
        ),
      },
      [
        'clipDescriptors',
        'generationWorkflowExecutionId',
        'projectId',
        'qaBatch',
        'referenceAssetIds',
      ],
    ),
    outputSchema: CONTINUITY_REPORT,
  },
  'clip.factory.fail': {
    inputSchema: closedObjectSchema(
      { job: ANALYSIS_REQUEST, workflowError: STRING_SCHEMA },
      ['job', 'workflowError'],
    ),
    outputSchema: closedObjectSchema(
      {
        projectId: STRING_SCHEMA,
        status: { const: 'failed', type: 'string' },
      },
      ['projectId', 'status'],
    ),
  },
  'clip.generation.finalize-child': {
    inputSchema: closedObjectSchema(
      {
        failure: JSON_DOCUMENT_SCHEMA,
        generation: GENERATION_RESULT,
        originalIndex: INTEGER_SCHEMA,
        request: GENERATION_REQUEST,
      },
      ['originalIndex', 'request'],
    ),
    outputSchema: closedObjectSchema(
      {
        ...GENERATION_RESULT_PROPERTIES,
        expectedClipCount: NUMBER_SCHEMA,
        observedClipCount: NUMBER_SCHEMA,
        originalIndex: NUMBER_SCHEMA,
        reconciled: BOOLEAN_SCHEMA,
      },
      [
        ...GENERATION_RESULT_REQUIRED,
        'expectedClipCount',
        'observedClipCount',
        'originalIndex',
        'reconciled',
      ],
    ),
  },
  'clip.generation.generate-one': {
    inputSchema: closedObjectSchema(
      { originalIndex: INTEGER_SCHEMA, request: GENERATION_REQUEST },
      ['originalIndex', 'request'],
    ),
    outputSchema: GENERATION_RESULT,
  },
  'clip.generation.plan': {
    inputSchema: planInput(),
    outputSchema: GENERATION_PLAN,
  },
  'clip.handoff.create-editor': {
    inputSchema: HANDOFF_INPUT,
    outputSchema: closedObjectSchema(
      {
        clipProjectId: STRING_SCHEMA,
        clipResultId: STRING_SCHEMA,
        editorPath: STRING_SCHEMA,
        editorProjectId: STRING_SCHEMA,
        videoUrl: STRING_SCHEMA,
      },
      [
        'clipProjectId',
        'clipResultId',
        'editorPath',
        'editorProjectId',
        'videoUrl',
      ],
    ),
  },
  'clip.handoff.link-library': {
    inputSchema: HANDOFF_INPUT,
    outputSchema: closedObjectSchema(
      {
        clipResultId: STRING_SCHEMA,
        error: STRING_SCHEMA,
        ingredientId: STRING_SCHEMA,
        status: enumSchema([
          'degraded',
          'failed',
          'linked',
          'pending',
        ] as const),
      },
      ['clipResultId', 'status'],
    ),
  },
  'clip.handoff.prepare-publish': {
    inputSchema: HANDOFF_INPUT,
    outputSchema: closedObjectSchema(
      {
        clipProjectId: STRING_SCHEMA,
        clipResultId: STRING_SCHEMA,
        payload: closedObjectSchema(
          {
            assets: arraySchema(
              closedObjectSchema(
                {
                  assetId: STRING_SCHEMA,
                  caption: STRING_SCHEMA,
                  mediaUrl: STRING_SCHEMA,
                  mimeType: STRING_SCHEMA,
                },
                ['assetId', 'mediaUrl', 'mimeType'],
              ),
            ),
            clipProjectId: STRING_SCHEMA,
            confirmBeforePublish: { const: true, type: 'boolean' },
            metadata: closedObjectSchema(
              {
                clipResultId: STRING_SCHEMA,
                ingredientId: STRING_SCHEMA,
                summary: STRING_SCHEMA,
                title: STRING_SCHEMA,
              },
              ['clipResultId', 'ingredientId'],
            ),
            platforms: arraySchema(STRING_SCHEMA),
            preparedAt: STRING_SCHEMA,
            schedule: { const: 'immediate', type: 'string' },
          },
          [
            'assets',
            'clipProjectId',
            'confirmBeforePublish',
            'metadata',
            'platforms',
            'preparedAt',
            'schedule',
          ],
        ),
      },
      ['clipProjectId', 'clipResultId', 'payload'],
    ),
  },
};

export function getClipActionContract(
  actionId: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[actionId];
}
