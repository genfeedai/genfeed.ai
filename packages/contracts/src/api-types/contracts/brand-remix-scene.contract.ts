import { z } from 'zod';

const id = z.string().trim().min(1).max(200);
const text = z.string().trim().min(1).max(4_000);
const timestamp = z.string().datetime();
export const brandRemixSceneIdentitySchema = z
  .object({
    avatarAssetId: id,
    speechVoiceId: id,
  })
  .strict();
export const brandRemixSceneObservationSchema = z
  .object({
    sourceAssetId: id,
    startSeconds: z.number().nonnegative().max(60),
    endSeconds: z.number().positive().max(60),
    keyframeSeconds: z.number().nonnegative().max(60),
    transcriptSlice: z.string().max(8_000),
    semanticIntent: text,
  })
  .strict()
  .refine(
    (value) =>
      value.startSeconds < value.endSeconds &&
      value.keyframeSeconds >= value.startSeconds &&
      value.keyframeSeconds <= value.endSeconds,
    'Invalid source observation bounds',
  );
export const brandRemixSceneStageSchema = z
  .object({
    attempt: z.number().int().positive(),
    state: z.enum([
      'pending',
      'claimed',
      'submitted',
      'ready',
      'failed',
      'uncertain',
    ]),
    groupId: id.optional(),
    claimToken: id.optional(),
    claimedAt: timestamp.optional(),
    assetId: id.optional(),
    error: text.optional(),
    creditKey: id.optional(),
  })
  .strict();
export const brandRemixSceneQuoteSchema = z
  .object({
    id,
    revision: z.number().int().positive(),
    operation: z.enum(['analysis', 'generate', 'repair']),
    sceneId: id.optional(),
    repairStage: z.enum(['image', 'video']).optional(),
    inputHash: id,
    createdAt: timestamp,
    expiresAt: timestamp,
    total: z.number().nonnegative().max(50),
    items: z
      .array(
        z
          .object({
            key: id,
            sceneId: id.optional(),
            stage: z.enum([
              'transcription',
              'analysis',
              'image',
              'video',
              'captions',
              'assembly',
            ]),
            model: id,
            credits: z.number().nonnegative(),
            billingMode: z.enum(['platform', 'byok']),
            attempt: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(15),
  })
  .strict()
  .refine(
    (quote) =>
      Math.abs(
        quote.items.reduce((sum, item) => sum + item.credits, 0) - quote.total,
      ) < 0.000001,
    'Quote total must equal line items',
  );
export const brandRemixScenePipelineSchema = z
  .object({
    version: z.literal(1),
    language: z.literal('en'),
    state: z.enum([
      'awaiting_analysis',
      'analysing',
      'storyboard',
      'quoted',
      'generating',
      'assembling',
      'ready',
      'partial_failure',
      'cancelled',
      'blocked',
    ]),
    cancellationGeneration: z.number().int().nonnegative(),
    quote: brandRemixSceneQuoteSchema.optional(),
    operation: z
      .object({
        id,
        quoteId: id,
        revision: z.number().int().positive(),
        cancellationGeneration: z.number().int().nonnegative(),
        startedAt: timestamp,
        resumedAt: timestamp.optional(),
        userId: id,
        sequence: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    error: text.optional(),
    analysis: z
      .object({
        sourceAssetId: id,
        durationSeconds: z.number().positive().max(60),
        sizeBytes: z.number().positive().max(104_857_600),
        model: id,
        transcript: z.string().max(50_000).optional(),
        srt: z.string().max(100_000).optional(),
        transcription: brandRemixSceneStageSchema,
        rewrite: brandRemixSceneStageSchema,
        keyframes: z
          .array(
            z
              .object({
                assetId: id,
                timestampSeconds: z.number().nonnegative().max(60),
              })
              .strict(),
          )
          .max(12),
        usage: z.record(z.string(), z.number().nonnegative()).optional(),
        vendorCostKnown: z.boolean(),
        requiresExplicitSceneIdentity: z.boolean().optional(),
      })
      .strict()
      .optional(),
    scenes: z.record(
      id,
      z
        .object({
          identity: brandRemixSceneIdentitySchema,
          referenceAssetIds: z.array(id).max(20),
          image: brandRemixSceneStageSchema,
          video: brandRemixSceneStageSchema,
          actualDurationSeconds: z.number().positive().optional(),
          replacedAssetIds: z.array(id).max(100),
        })
        .strict(),
    ),
    assembly: z
      .object({
        assetId: id.optional(),
        mergedAssetId: id.optional(),
        orderedAssetIds: z.array(id).max(6),
        mergeJobId: id.optional(),
        captionJobId: id.optional(),
        mergedStorageKey: id.optional(),
        finalStorageKey: id.optional(),
        srt: z.string().max(100_000).optional(),
        transcription: brandRemixSceneStageSchema,
        error: text.optional(),
      })
      .strict()
      .optional(),
    receipts: z
      .array(
        z
          .object({
            key: id,
            operationId: id.optional(),
            actorUserId: id.optional(),
            amount: z.number().nonnegative(),
            billingMode: z.enum(['platform', 'byok']),
            state: z.enum(['reserved', 'settled', 'released', 'uncertain']),
          })
          .strict(),
      )
      .max(200),
    replacedAssetIds: z.array(id).max(200),
  })
  .strict();
export const quoteBrandRemixScenesSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    operation: z.enum(['analysis', 'generate', 'repair']),
    sceneId: id.optional(),
    repairStage: z.enum(['image', 'video']).optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.operation === 'repair'
        ? Boolean(input.sceneId)
        : !input.sceneId && !input.repairStage,
    'Only repair accepts a scene and stage',
  );
export const executeBrandRemixScenesSchema = z
  .object({ expectedRevision: z.number().int().positive(), quoteId: id })
  .strict();
export const controlBrandRemixScenesSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
export type BrandRemixScenePipeline = z.infer<
  typeof brandRemixScenePipelineSchema
>;
export type BrandRemixSceneQuote = z.infer<typeof brandRemixSceneQuoteSchema>;
export type QuoteBrandRemixScenes = z.infer<typeof quoteBrandRemixScenesSchema>;
export type ExecuteBrandRemixScenes = z.infer<
  typeof executeBrandRemixScenesSchema
>;
export type ControlBrandRemixScenes = z.infer<
  typeof controlBrandRemixScenesSchema
>;

export const brandRemixAnalysisSourceSchema = z
  .object({
    assetId: id,
    assetUpdatedAt: timestamp,
    selectedByUserId: id,
    selectedAt: timestamp,
    selection: z.literal('brand_library'),
    purpose: z.literal('analysis_only'),
  })
  .strict();
export const attachBrandRemixAnalysisSourceSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    assetId: id.nullable(),
  })
  .strict();
export type AttachBrandRemixAnalysisSource = z.infer<
  typeof attachBrandRemixAnalysisSourceSchema
>;
