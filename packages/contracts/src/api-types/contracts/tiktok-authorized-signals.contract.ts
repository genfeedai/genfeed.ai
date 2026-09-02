import { z } from 'zod';
import { CredentialPlatform } from '../..';

import { socialWarmupProvenanceSchema } from './social-warmup-blueprint.contract';

export const tiktokAuthorizedSignalStateValues = [
  'full',
  'partial',
  'revoked',
  'empty',
  'stale',
] as const;

export const tiktokAuthorizedSignalStatusValues = [
  'available',
  'empty',
  'permission_limited',
  'unavailable',
  'revoked',
  'stale',
] as const;

export const tiktokAuthorizedSignalReasonValues = [
  'missing_scope',
  'empty_response',
  'authorization_revoked',
  'rate_limited',
  'provider_error',
] as const;

export const tiktokAuthorizedSignalEvidenceKeys = [
  'profile-completeness-signal',
  'profile-statistics-snapshot',
  'public-videos-snapshot',
  'creator-capabilities-snapshot',
  'first-upload-platform-signal',
  'owned-post-metrics-snapshot',
  'genfeed-publish-activity',
] as const;

export const tiktokAuthorizedSignalStateSchema = z.enum(
  tiktokAuthorizedSignalStateValues,
);
export const tiktokAuthorizedSignalStatusSchema = z.enum(
  tiktokAuthorizedSignalStatusValues,
);
export const tiktokAuthorizedSignalReasonSchema = z.enum(
  tiktokAuthorizedSignalReasonValues,
);

const timestampSchema = z.iso.datetime();
const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const tiktokAuthorizedSignalScopeSchema = z
  .object({
    granted: z.array(z.string().trim().min(1)),
    missing: z.array(z.string().trim().min(1)),
    required: z.array(z.string().trim().min(1)),
  })
  .strict();

const fieldAvailabilitySchema = z.record(
  z.string().trim().min(1),
  tiktokAuthorizedSignalStatusSchema,
);

const profileValueSchema = z
  .object({
    avatarUrl: z.string().url().optional(),
    bioDescription: z.string().optional(),
    displayName: z.string().optional(),
    isVerified: z.boolean().optional(),
    profileDeepLink: z.string().url().optional(),
    username: z.string().optional(),
  })
  .strict();

const statisticsValueSchema = z
  .object({
    followerCount: nonNegativeIntegerSchema.optional(),
    followingCount: nonNegativeIntegerSchema.optional(),
    likesCount: nonNegativeIntegerSchema.optional(),
    videoCount: nonNegativeIntegerSchema.optional(),
  })
  .strict();

export const tiktokOwnedVideoSignalSchema = z
  .object({
    commentCount: nonNegativeIntegerSchema.optional(),
    createTime: nonNegativeIntegerSchema.optional(),
    duration: nonNegativeIntegerSchema.optional(),
    id: z.string().trim().min(1),
    likeCount: nonNegativeIntegerSchema.optional(),
    shareCount: nonNegativeIntegerSchema.optional(),
    shareUrl: z.string().url().optional(),
    title: z.string().optional(),
    videoDescription: z.string().optional(),
    viewCount: nonNegativeIntegerSchema.optional(),
  })
  .strict();

const publicVideosValueSchema = z
  .object({
    hasMore: z.boolean(),
    videos: z.array(tiktokOwnedVideoSignalSchema).max(20),
  })
  .strict();

const creatorCapabilitiesValueSchema = z
  .object({
    commentDisabled: z.boolean().optional(),
    creatorNickname: z.string().optional(),
    creatorUsername: z.string().optional(),
    duetDisabled: z.boolean().optional(),
    maxVideoPostDurationSeconds: nonNegativeIntegerSchema.optional(),
    privacyLevelOptions: z.array(z.string().trim().min(1)).optional(),
    stitchDisabled: z.boolean().optional(),
  })
  .strict();

export const tiktokGenfeedPublishOutcomeValues = [
  'scheduled',
  'publishing',
  'published',
  'failed',
  'paused',
  'cancelled',
  'skipped',
] as const;

const genfeedPublishActivityValueSchema = z
  .object({
    attempts: z
      .array(
        z
          .object({
            attemptedAt: timestampSchema,
            outcome: z.enum(tiktokGenfeedPublishOutcomeValues),
            postId: z.string().trim().min(1),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

const evidenceMetadataShape = {
  fieldAvailability: fieldAvailabilitySchema,
  observedAt: timestampSchema.nullable(),
  reason: tiktokAuthorizedSignalReasonSchema.optional(),
  scope: tiktokAuthorizedSignalScopeSchema,
  staleAt: timestampSchema.nullable(),
  status: tiktokAuthorizedSignalStatusSchema,
};

const profileEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('profile-completeness-signal'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: profileValueSchema.optional(),
  })
  .strict();

const statisticsEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('profile-statistics-snapshot'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: statisticsValueSchema.optional(),
  })
  .strict();

const publicVideosEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('public-videos-snapshot'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: publicVideosValueSchema.optional(),
  })
  .strict();

const creatorCapabilitiesEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('creator-capabilities-snapshot'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: creatorCapabilitiesValueSchema.optional(),
  })
  .strict();

const firstUploadEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('first-upload-platform-signal'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: z
      .object({ video: tiktokOwnedVideoSignalSchema.optional() })
      .strict()
      .optional(),
  })
  .strict();

const ownedPostMetricsEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('owned-post-metrics-snapshot'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: z
      .object({ videos: z.array(tiktokOwnedVideoSignalSchema).max(20) })
      .strict()
      .optional(),
  })
  .strict();

const genfeedPublishActivityEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('genfeed-publish-activity'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.genfeed_observed),
    value: genfeedPublishActivityValueSchema,
  })
  .strict();

export const tiktokAuthorizedSignalEvidenceSchema = z.discriminatedUnion(
  'key',
  [
    profileEvidenceSchema,
    statisticsEvidenceSchema,
    publicVideosEvidenceSchema,
    creatorCapabilitiesEvidenceSchema,
    firstUploadEvidenceSchema,
    ownedPostMetricsEvidenceSchema,
    genfeedPublishActivityEvidenceSchema,
  ],
);

export const tiktokAuthorizedSignalsSnapshotSchema = z
  .object({
    credentialId: z.string().trim().min(1),
    evidence: z.array(tiktokAuthorizedSignalEvidenceSchema).length(7),
    grantedScopes: z.array(z.string().trim().min(1)),
    platform: z.literal(CredentialPlatform.TIKTOK),
    refreshAttemptedAt: timestampSchema,
    state: tiktokAuthorizedSignalStateSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const keys = snapshot.evidence.map((evidence) => evidence.key);

    for (const expectedKey of tiktokAuthorizedSignalEvidenceKeys) {
      const occurrences = keys.filter((key) => key === expectedKey).length;
      if (occurrences !== 1) {
        context.addIssue({
          code: 'custom',
          message: `Expected exactly one TikTok warm-up evidence item for ${expectedKey}.`,
          path: ['evidence'],
        });
      }
    }
  });

export type TikTokAuthorizedSignalState = z.infer<
  typeof tiktokAuthorizedSignalStateSchema
>;
export type TikTokAuthorizedSignalStatus = z.infer<
  typeof tiktokAuthorizedSignalStatusSchema
>;
export type TikTokAuthorizedSignalReason = z.infer<
  typeof tiktokAuthorizedSignalReasonSchema
>;
export type TikTokAuthorizedSignalEvidence = z.infer<
  typeof tiktokAuthorizedSignalEvidenceSchema
>;
export type TikTokOwnedVideoSignal = z.infer<
  typeof tiktokOwnedVideoSignalSchema
>;
export type TikTokAuthorizedSignalsSnapshot = z.infer<
  typeof tiktokAuthorizedSignalsSnapshotSchema
>;
