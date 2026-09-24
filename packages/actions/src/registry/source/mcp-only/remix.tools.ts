import type { SourceTool } from '../../../interfaces/source-tool.interface';
import type { ToolParameterSchema } from '../../../interfaces/tool-definition.interface';

const opaqueId = {
  type: 'string',
  minLength: 1,
  maxLength: 255,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$',
};
const quoteId = { type: 'string', minLength: 1, maxLength: 200 };
const shortText = { type: 'string', minLength: 1, maxLength: 1000 };
const longText = { type: 'string', minLength: 1, maxLength: 10000 };
const revision = { type: 'integer', minimum: 1 };
const object = (
  properties: Record<string, unknown>,
  required: string[] = [],
): ToolParameterSchema => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
const nullable = (schema: Record<string, unknown>) => ({
  anyOf: [schema, { type: 'null' }],
});
const identity = object({ avatarAssetId: quoteId, speechVoiceId: quoteId }, [
  'avatarAssetId',
  'speechVoiceId',
]);
const observation = object(
  {
    sourceAssetId: quoteId,
    startSeconds: { type: 'number', minimum: 0, maximum: 60 },
    endSeconds: { type: 'number', exclusiveMinimum: 0, maximum: 60 },
    keyframeSeconds: { type: 'number', minimum: 0, maximum: 60 },
    transcriptSlice: { type: 'string', maxLength: 8000 },
    semanticIntent: { type: 'string', minLength: 1, maxLength: 4000 },
  },
  [
    'sourceAssetId',
    'startSeconds',
    'endSeconds',
    'keyframeSeconds',
    'transcriptSlice',
    'semanticIntent',
  ],
);
const scene = object(
  {
    id: opaqueId,
    identity,
    sourceObservation: observation,
    ordinal: { type: 'integer', minimum: 1, maximum: 12 },
    visualIntent: shortText,
    narration: shortText,
    durationSeconds: { type: 'number', exclusiveMinimum: 0, maximum: 60 },
  },
  ['ordinal', 'visualIntent'],
);
const edits = {
  ...object({
    concept: object({
      angle: nullable(shortText),
      hook: nullable(shortText),
      script: nullable(longText),
      storyboard: { type: 'array', maxItems: 12, items: scene },
    }),
    fidelityMode: { type: 'string', enum: ['off', 'guided', 'strict'] },
    identity: {
      anyOf: [
        object({ avatarAssetId: opaqueId, speechVoiceId: opaqueId }, [
          'avatarAssetId',
          'speechVoiceId',
        ]),
        object(
          { avatarAssetId: { type: 'null' }, speechVoiceId: { type: 'null' } },
          ['avatarAssetId', 'speechVoiceId'],
        ),
      ],
    },
    intent: object({
      angle: shortText,
      audience: shortText,
      callToAction: shortText,
      hook: shortText,
      objective: longText,
      offer: shortText,
      pacing: shortText,
      structure: shortText,
      visualDirection: shortText,
    }),
    output: object({
      aspectRatio: { type: 'string', pattern: '^[1-9]\\d{0,3}:[1-9]\\d{0,3}$' },
      count: { type: 'integer', minimum: 1, maximum: 8 },
      durationSeconds: nullable({
        type: 'number',
        exclusiveMinimum: 0,
        maximum: 300,
      }),
      kind: { type: 'string', enum: ['copy', 'image', 'video', 'avatar'] },
    }),
    references: {
      type: 'array',
      maxItems: 20,
      items: object(
        {
          assetId: opaqueId,
          description: shortText,
          role: {
            type: 'string',
            enum: [
              'subject',
              'character',
              'product',
              'style',
              'composition',
              'first_frame',
              'last_frame',
              'reference_video',
            ],
          },
        },
        ['assetId', 'role'],
      ),
    },
    target: {
      anyOf: [
        object(
          {
            credentialId: opaqueId,
            kind: { const: 'organic' },
            platform: {
              type: 'string',
              enum: ['tiktok', 'instagram', 'youtube', 'x'],
            },
          },
          ['kind', 'platform'],
        ),
        object(
          {
            channel: {
              type: 'string',
              enum: ['all', 'search', 'display', 'youtube'],
            },
            credentialId: opaqueId,
            kind: { const: 'paid' },
            placement: shortText,
            platform: {
              type: 'string',
              enum: ['meta', 'google', 'tiktok', 'x'],
            },
          },
          ['kind', 'platform'],
        ),
      ],
    },
  }),
  minProperties: 1,
};
const run = { runId: opaqueId };
const versionedRun = { ...run, expectedRevision: revision };

export const MCP_REMIX_TOOLS: SourceTool[] = [
  {
    name: 'import_source_post',
    description:
      'Import a supported public X, Instagram or TikTok post into Imported sources for an explicit brand. Returns source/post identities and deduplication. Requires approval for external import; never generates, publishes or adds Knowledge.',
    parameters: object(
      {
        brandId: opaqueId,
        url: {
          type: 'string',
          pattern: '^https?://',
          maxLength: 512,
        },
      },
      ['brandId', 'url'],
    ),
    creditCost: 0,
    requiredRole: 'user',
  },
  {
    name: 'create_remix_concept',
    description:
      'Create or reuse a canonical saved remix concept from an imported source post for an explicit brand. Saving does not generate or publish.',
    parameters: object({ brandId: opaqueId, sourcePostId: opaqueId }, [
      'brandId',
      'sourcePostId',
    ]),
    creditCost: 0,
    requiredRole: 'user',
  },
  {
    name: 'get_remix_run',
    description:
      'Read the canonical remix revision, source lineage, saved concept, quotes, scene state, receipts and generated artifacts. Safe to repeat after reconnecting.',
    parameters: object(run, ['runId']),
    creditCost: 0,
    requiredRole: 'user',
  },
  {
    name: 'update_remix_concept',
    description:
      'Save canonical concept and recipe edits at the expected revision. Stale revisions fail; does not generate or replace the imported source.',
    parameters: object({ ...versionedRun, edits }, [
      'runId',
      'expectedRevision',
      'edits',
    ]),
    creditCost: 0,
    requiredRole: 'user',
  },
  {
    name: 'attach_remix_analysis_source',
    description:
      'Select an eligible same-brand USER Library video for scene analysis, or clear with null. The selected Library media is analyzed; the original imported URL remains provenance. This does not infer permission or start paid analysis.',
    parameters: object({ ...versionedRun, assetId: nullable(quoteId) }, [
      'runId',
      'expectedRevision',
      'assetId',
    ]),
    creditCost: 0,
    requiredRole: 'user',
  },
  {
    name: 'quote_remix_generation',
    description:
      'Save a concrete generation quote for this revision without dispatch. Image requires an explicit model; copy uses its canonical model. Video/avatar uses scene analysis, generate or repair quotes and rejects model. Inspect the quote before approval. BYOK can still incur external provider costs.',
    parameters: object(
      {
        ...versionedRun,
        operation: { type: 'string', enum: ['analysis', 'generate', 'repair'] },
        model: quoteId,
        sceneId: quoteId,
        repairStage: { type: 'string', enum: ['image', 'video'] },
      },
      ['runId', 'expectedRevision', 'operation'],
    ),
    creditCost: 0,
    requiredRole: 'user',
  },
  {
    name: 'start_remix_generation',
    description:
      'Execute the exact persisted quote and revision after explicit approval. Routes by canonical output/quote; repeated accepted execution retrieves the same run rather than buying another attempt.',
    parameters: object({ ...versionedRun, quoteId }, [
      'runId',
      'expectedRevision',
      'quoteId',
    ]),
    creditCost: 0,
    requiredRole: 'user',
  },
  {
    name: 'control_remix_generation',
    description:
      'Cancel or resume an existing canonical video/avatar scene pipeline after approval. Image/copy control is unsupported; resume retains canonical quote and billing checks.',
    parameters: object(
      {
        ...versionedRun,
        action: { type: 'string', enum: ['cancel', 'resume'] },
      },
      ['runId', 'expectedRevision', 'action'],
    ),
    creditCost: 0,
    requiredRole: 'user',
  },
];
