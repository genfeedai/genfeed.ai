/**
 * Durable brand-remix run contract.
 *
 * Callers submit only stable source selectors and editable creative intent.
 * The server resolves source evidence, brand context, references, capabilities,
 * credits, provider payloads, and downstream provenance.
 */

import { ContentRunSource, ContentRunStatus } from '@genfeedai/enums';
import { z } from 'zod';
import {
  generationBriefReferenceSchema,
  generationBriefSchema,
  generationFidelityModeSchema,
} from './generation-brief.contract';

export const BRAND_REMIX_RUN_CONTRACT = 'brand-remix-run';
export const BRAND_REMIX_RUN_VERSION = 1;

const opaqueIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/);
const shortTextSchema = z.string().trim().min(1).max(1_000);
const longTextSchema = z.string().trim().min(1).max(10_000);
const aspectRatioSchema = z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/);

export const brandRemixAdPlatformValues = [
  'meta',
  'google',
  'tiktok',
  'x',
] as const;
export const brandRemixOrganicPlatformValues = [
  'tiktok',
  'instagram',
  'youtube',
] as const;
export const brandRemixOutputKindValues = [
  'copy',
  'image',
  'video',
  'avatar',
] as const;
export const brandRemixPhaseValues = [
  'prefilled',
  'generating',
  'partially_ready',
  'ready_for_review',
  'in_review',
  'approved',
  'paid_draft_creating',
  'paid_draft_ready',
  'failed',
] as const;

export const trendReferenceRemixSourceSelectorSchema = z
  .object({
    kind: z.literal('trend_reference'),
    sourceReferenceId: opaqueIdSchema,
    trendId: opaqueIdSchema,
  })
  .strict();

export const sourcePostRemixSourceSelectorSchema = z
  .object({
    kind: z.literal('source_post'),
    sourcePostId: opaqueIdSchema,
  })
  .strict();

export const ownedPostRemixSourceSelectorSchema = z
  .object({
    kind: z.literal('owned_post'),
    postId: opaqueIdSchema,
  })
  .strict();

export const publicAdRemixSourceSelectorSchema = z
  .object({
    adPerformanceId: opaqueIdSchema,
    kind: z.literal('public_ad'),
  })
  .strict();

export const savedAdRemixSourceSelectorSchema = z
  .object({
    kind: z.literal('saved_ad'),
    savedAdId: opaqueIdSchema,
  })
  .strict();

export const connectedAdRemixSourceSelectorSchema = z
  .object({
    adAccountId: opaqueIdSchema,
    adId: opaqueIdSchema,
    channel: z.enum(['all', 'search', 'display', 'youtube']).optional(),
    credentialId: opaqueIdSchema,
    kind: z.literal('connected_ad'),
    loginCustomerId: opaqueIdSchema.optional(),
    platform: z.enum(brandRemixAdPlatformValues),
  })
  .strict();

export const brandRemixSourceSelectorSchema = z.discriminatedUnion('kind', [
  trendReferenceRemixSourceSelectorSchema,
  sourcePostRemixSourceSelectorSchema,
  ownedPostRemixSourceSelectorSchema,
  publicAdRemixSourceSelectorSchema,
  savedAdRemixSourceSelectorSchema,
  connectedAdRemixSourceSelectorSchema,
]);

export const brandRemixSourcePatternSchema = z
  .object({
    angle: shortTextSchema.optional(),
    callToAction: shortTextSchema.optional(),
    hook: shortTextSchema.optional(),
    offer: shortTextSchema.optional(),
    pacing: shortTextSchema.optional(),
    structure: shortTextSchema.optional(),
    visualDirection: shortTextSchema.optional(),
  })
  .strict();

export const brandRemixSourceSnapshotSchema = z
  .object({
    authorHandle: shortTextSchema.optional(),
    canonicalUrl: z.string().url().max(2_048).optional(),
    capturedAt: z.string().datetime(),
    destinationUrl: z.string().url().max(2_048).optional(),
    evidence: z.array(shortTextSchema).max(50).default([]),
    metrics: z.record(z.string().trim().min(1).max(100), z.number().finite()),
    pattern: brandRemixSourcePatternSchema,
    platform: z.enum([...brandRemixAdPlatformValues, 'instagram', 'youtube']),
    selector: brandRemixSourceSelectorSchema,
    sourceId: opaqueIdSchema,
    title: shortTextSchema,
  })
  .strict();

export const brandRemixTargetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('organic'),
      platform: z.enum(brandRemixOrganicPlatformValues),
    })
    .strict(),
  z
    .object({
      channel: z.enum(['all', 'search', 'display', 'youtube']).optional(),
      kind: z.literal('paid'),
      placement: shortTextSchema.optional(),
      platform: z.enum(brandRemixAdPlatformValues),
    })
    .strict(),
]);

export const brandRemixIntentSchema = z
  .object({
    angle: shortTextSchema.optional(),
    audience: shortTextSchema.optional(),
    callToAction: shortTextSchema.optional(),
    hook: shortTextSchema.optional(),
    objective: longTextSchema,
    offer: shortTextSchema.optional(),
    pacing: shortTextSchema.optional(),
    structure: shortTextSchema.optional(),
    visualDirection: shortTextSchema.optional(),
  })
  .strict();

export const brandRemixOutputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      count: z.number().int().min(1).max(8),
      kind: z.literal('copy'),
    })
    .strict(),
  z
    .object({
      aspectRatio: aspectRatioSchema,
      count: z.number().int().min(1).max(8),
      kind: z.literal('image'),
    })
    .strict(),
  z
    .object({
      aspectRatio: aspectRatioSchema,
      count: z.number().int().min(1).max(8),
      durationSeconds: z.number().positive().max(300).optional(),
      kind: z.literal('video'),
    })
    .strict(),
  z
    .object({
      aspectRatio: aspectRatioSchema,
      count: z.number().int().min(1).max(8),
      durationSeconds: z.number().positive().max(300).optional(),
      kind: z.literal('avatar'),
    })
    .strict(),
]);

export const brandRemixReferenceSchema = generationBriefReferenceSchema
  .extend({
    assetId: opaqueIdSchema,
    source: z.enum(['brand_default', 'explicit']),
  })
  .strict();

export const brandRemixReferenceEditSchema = generationBriefReferenceSchema
  .extend({
    assetId: opaqueIdSchema,
  })
  .strict();

export const pairedBrandRemixIdentitySchema = z
  .object({
    avatarAssetId: opaqueIdSchema,
    speechVoiceId: opaqueIdSchema,
  })
  .strict();

export type PairedBrandRemixIdentity = z.infer<
  typeof pairedBrandRemixIdentitySchema
>;

export const brandRemixIdentitySchema = z.union([
  z.object({}).strict(),
  pairedBrandRemixIdentitySchema,
]);

export const brandRemixDraftSchema = z
  .object({
    fidelityMode: generationFidelityModeSchema,
    identity: brandRemixIdentitySchema,
    intent: brandRemixIntentSchema,
    output: brandRemixOutputSchema,
    references: z.array(brandRemixReferenceSchema).max(20).default([]),
    reviewRequired: z.literal(true),
    target: brandRemixTargetSchema,
  })
  .strict();

export const brandRemixReadinessIssueCodeValues = [
  'organization_defaults',
  'missing_avatar',
  'missing_ads_management',
  'missing_ads_write',
  'missing_voice',
  'missing_required_reference',
  'source_media_unavailable',
  'unsupported_reference_role',
  'unsupported_fidelity',
  'unsupported_output',
  'unsupported_aspect_ratio',
  'unsupported_duration',
] as const;

export const brandRemixReadinessIssueSchema = z
  .object({
    code: z.enum(brandRemixReadinessIssueCodeValues),
    field: z.enum([
      'intent',
      'output',
      'target',
      'fidelityMode',
      'references',
      'avatarAssetId',
      'speechVoiceId',
    ]),
    message: shortTextSchema,
    severity: z.enum(['degraded', 'blocked']),
  })
  .strict();

export const brandRemixReadinessSchema = z
  .object({
    issues: z.array(brandRemixReadinessIssueSchema).max(50).default([]),
    state: z.enum(['ready', 'degraded', 'blocked']),
  })
  .strict();

export const brandRemixOutputVariantSchema = z
  .object({
    assetIds: z.array(opaqueIdSchema).max(20).default([]),
    content: longTextSchema.optional(),
    error: shortTextSchema.optional(),
    id: opaqueIdSchema,
    recipeRevision: z.number().int().positive(),
    status: z.enum(['queued', 'processing', 'ready', 'failed']),
  })
  .strict();

const durableBrandRemixGenerationBriefSchema =
  generationBriefSchema.superRefine((brief, context) => {
    brief.references.forEach((reference, index) => {
      if (!opaqueIdSchema.safeParse(reference.assetId).success) {
        context.addIssue({
          code: 'custom',
          message: 'Brand remix references must use durable asset IDs.',
          path: ['references', index, 'assetId'],
        });
      }
    });
  });

export const brandRemixExecutionSchema = z
  .object({
    actualCount: z.number().int().min(0).max(8),
    generationBrief: durableBrandRemixGenerationBriefSchema,
    partialReason: shortTextSchema.optional(),
    requestedCount: z.number().int().min(1).max(8),
    variants: z.array(brandRemixOutputVariantSchema).max(8),
  })
  .strict();

export const brandRemixGenerationClaimSchema = z
  .object({
    claimedAt: z.string().datetime(),
    id: opaqueIdSchema,
    variantIds: z.array(opaqueIdSchema).min(1).max(8),
  })
  .strict();

export const brandRemixReviewSchema = z
  .object({
    approvedPostIds: z.array(opaqueIdSchema).max(8).default([]),
    batchId: opaqueIdSchema,
    postIds: z.array(opaqueIdSchema).max(8),
    workflowExecutionId: opaqueIdSchema.optional(),
    workflowId: opaqueIdSchema.optional(),
  })
  .strict();

export const brandRemixReviewClaimSchema = z
  .object({
    claimedAt: z.string().datetime(),
    id: opaqueIdSchema,
    selectedVariantIds: z.array(opaqueIdSchema).min(1).max(8),
    status: z.enum(['claimed', 'completed']),
  })
  .strict();

export const pausedMetaCampaignDraftSchema = z
  .object({
    adAccountId: opaqueIdSchema,
    adId: opaqueIdSchema,
    adSetId: opaqueIdSchema,
    campaignId: opaqueIdSchema,
    credentialId: opaqueIdSchema,
    ingredientId: opaqueIdSchema,
    postId: opaqueIdSchema,
    recipeRevision: z.number().int().positive(),
    recipeVersion: z.literal(BRAND_REMIX_RUN_VERSION),
    replayed: z.boolean(),
    status: z.literal('PAUSED'),
    variantId: opaqueIdSchema,
    workflowExecutionId: opaqueIdSchema,
    workflowId: opaqueIdSchema.optional(),
  })
  .strict();

export const pausedMetaCampaignDraftOperationSchema = z
  .object({
    adAccountId: opaqueIdSchema,
    claimedAt: z.string().datetime(),
    credentialId: opaqueIdSchema,
    id: opaqueIdSchema,
    /** Meta only: the campaign destination URL. */
    linkUrl: z.string().url().max(2_048).optional(),
    /** X Ads only: id of an existing tweet to promote. */
    sourceTweetId: opaqueIdSchema.optional(),
    variantId: opaqueIdSchema,
  })
  .strict();

export const brandRemixBrandContextSchema = z
  .object({
    contextMode: z.enum(['brand', 'organization_defaults']),
    id: opaqueIdSchema,
    name: shortTextSchema,
  })
  .strict();

export const brandRemixRunConfigSchema = z
  .object({
    contract: z.literal(BRAND_REMIX_RUN_CONTRACT),
    draft: brandRemixDraftSchema,
    execution: brandRemixExecutionSchema.optional(),
    generationClaim: brandRemixGenerationClaimSchema.optional(),
    paidDraft: pausedMetaCampaignDraftSchema.optional(),
    paidDraftOperation: pausedMetaCampaignDraftOperationSchema.optional(),
    phase: z.enum(brandRemixPhaseValues),
    readiness: brandRemixReadinessSchema,
    recipeVersion: z.literal(BRAND_REMIX_RUN_VERSION),
    review: brandRemixReviewSchema.optional(),
    reviewClaim: brandRemixReviewClaimSchema.optional(),
    revision: z.number().int().positive(),
    source: z.nativeEnum(ContentRunSource).optional(),
    sourceSnapshot: brandRemixSourceSnapshotSchema,
    version: z.literal(BRAND_REMIX_RUN_VERSION),
  })
  .strict();

export const brandRemixRunViewSchema = z
  .object({
    brand: brandRemixBrandContextSchema,
    brandId: opaqueIdSchema,
    contract: z.literal(BRAND_REMIX_RUN_CONTRACT),
    createdAt: z.string().datetime(),
    draft: brandRemixDraftSchema,
    execution: brandRemixExecutionSchema.optional(),
    generationClaim: brandRemixGenerationClaimSchema.optional(),
    id: opaqueIdSchema,
    paidDraft: pausedMetaCampaignDraftSchema.optional(),
    paidDraftOperation: pausedMetaCampaignDraftOperationSchema.optional(),
    phase: z.enum(brandRemixPhaseValues),
    readiness: brandRemixReadinessSchema,
    recipeVersion: z.literal(BRAND_REMIX_RUN_VERSION),
    review: brandRemixReviewSchema.optional(),
    reviewClaim: brandRemixReviewClaimSchema.optional(),
    revision: z.number().int().positive(),
    source: z.nativeEnum(ContentRunSource).optional(),
    sourceSnapshot: brandRemixSourceSnapshotSchema,
    status: z.nativeEnum(ContentRunStatus),
    updatedAt: z.string().datetime(),
    version: z.literal(BRAND_REMIX_RUN_VERSION),
  })
  .strict();

const brandRemixOutputPatchSchema = z
  .object({
    aspectRatio: aspectRatioSchema.optional(),
    count: z.number().int().min(1).max(8).optional(),
    durationSeconds: z.number().positive().max(300).nullable().optional(),
    kind: z.enum(brandRemixOutputKindValues).optional(),
  })
  .strict();

const brandRemixIntentPatchSchema = brandRemixIntentSchema.partial().strict();
const brandRemixIdentityPatchSchema = z.union([
  pairedBrandRemixIdentitySchema,
  z
    .object({
      avatarAssetId: z.null(),
      speechVoiceId: z.null(),
    })
    .strict(),
]);

export const brandRemixDraftEditsSchema = z
  .object({
    fidelityMode: generationFidelityModeSchema.optional(),
    identity: brandRemixIdentityPatchSchema.optional(),
    intent: brandRemixIntentPatchSchema.optional(),
    output: brandRemixOutputPatchSchema.optional(),
    references: z.array(brandRemixReferenceEditSchema).max(20).optional(),
    target: brandRemixTargetSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one remix draft edit is required.',
  });

export const createBrandRemixRunSchema = z
  .object({
    edits: brandRemixDraftEditsSchema.optional(),
    source: brandRemixSourceSelectorSchema,
  })
  .strict();

export const reviseBrandRemixRunSchema = z
  .object({
    edits: brandRemixDraftEditsSchema,
    expectedRevision: z.number().int().positive(),
  })
  .strict();

export const startBrandRemixRunSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
  })
  .strict();

export const submitBrandRemixRunForReviewSchema = z
  .object({
    variantIds: z.array(opaqueIdSchema).min(1).max(8).optional(),
  })
  .strict();

export const preparePausedMetaCampaignDraftSchema = z
  .object({
    destination: z
      .object({
        adAccountId: opaqueIdSchema,
        credentialId: opaqueIdSchema,
      })
      .strict(),
    /**
     * X Ads only: the id of an existing tweet to promote. X's Ads API
     * promotes existing tweets rather than creating new creative from
     * uploaded media, so this is required when the run's paid target
     * platform is `x` and ignored otherwise.
     */
    sourceTweetId: opaqueIdSchema.optional(),
    variantId: opaqueIdSchema.optional(),
  })
  .strict();

export type BrandRemixSourceSelector = z.infer<
  typeof brandRemixSourceSelectorSchema
>;
export type BrandRemixSourceSnapshot = z.infer<
  typeof brandRemixSourceSnapshotSchema
>;
export type BrandRemixTarget = z.infer<typeof brandRemixTargetSchema>;
export type BrandRemixReference = z.infer<typeof brandRemixReferenceSchema>;
export type BrandRemixDraft = z.infer<typeof brandRemixDraftSchema>;
export type BrandRemixDraftEdits = z.infer<typeof brandRemixDraftEditsSchema>;
export type BrandRemixReadiness = z.infer<typeof brandRemixReadinessSchema>;
export type BrandRemixExecution = z.infer<typeof brandRemixExecutionSchema>;
export type BrandRemixRunConfig = z.infer<typeof brandRemixRunConfigSchema>;
export type BrandRemixRunView = z.infer<typeof brandRemixRunViewSchema>;
export type CreateBrandRemixRun = z.infer<typeof createBrandRemixRunSchema>;
export type ReviseBrandRemixRun = z.infer<typeof reviseBrandRemixRunSchema>;
export type StartBrandRemixRun = z.infer<typeof startBrandRemixRunSchema>;
export type SubmitBrandRemixRunForReview = z.infer<
  typeof submitBrandRemixRunForReviewSchema
>;
export type PreparePausedMetaCampaignDraft = z.infer<
  typeof preparePausedMetaCampaignDraftSchema
>;
