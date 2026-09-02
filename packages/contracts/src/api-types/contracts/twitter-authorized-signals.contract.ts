import { z } from 'zod';
import { CredentialPlatform } from '../..';

import { socialWarmupProvenanceSchema } from './social-warmup-blueprint.contract';

export const twitterAuthorizedSignalStateValues = [
  'full',
  'partial',
  'revoked',
  'empty',
  'stale',
] as const;

export const twitterAuthorizedSignalStatusValues = [
  'available',
  'empty',
  'permission_limited',
  'unavailable',
  'revoked',
  'stale',
] as const;

export const twitterAuthorizedSignalReasonValues = [
  'missing_scope',
  'empty_response',
  'authorization_revoked',
  'rate_limited',
  'provider_error',
] as const;

export const twitterAuthorizedSignalEvidenceKeys = [
  'profile-completeness-signal',
  'profile-statistics-snapshot',
  'owned-posts-snapshot',
  'publishing-capability-snapshot',
  'first-upload-platform-signal',
  'owned-post-metrics-snapshot',
  'native-account-age',
  'genfeed-publish-activity',
] as const;

export const twitterAuthorizedSignalStateSchema = z.enum(
  twitterAuthorizedSignalStateValues,
);
export const twitterAuthorizedSignalStatusSchema = z.enum(
  twitterAuthorizedSignalStatusValues,
);
export const twitterAuthorizedSignalReasonSchema = z.enum(
  twitterAuthorizedSignalReasonValues,
);

const timestampSchema = z.iso.datetime();
const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const twitterAuthorizedSignalScopeSchema = z
  .object({
    granted: z.array(z.string().trim().min(1)),
    missing: z.array(z.string().trim().min(1)),
    required: z.array(z.string().trim().min(1)),
  })
  .strict();

const fieldAvailabilitySchema = z.record(
  z.string().trim().min(1),
  twitterAuthorizedSignalStatusSchema,
);

const profileValueSchema = z
  .object({
    createdAt: timestampSchema.optional(),
    description: z.string().optional(),
    isProtected: z.boolean().optional(),
    isVerified: z.boolean().optional(),
    location: z.string().optional(),
    name: z.string().optional(),
    profileImageUrl: z.string().url().optional(),
    url: z.string().url().optional(),
    username: z.string().optional(),
    verifiedType: z.string().optional(),
  })
  .strict();

const statisticsValueSchema = z
  .object({
    followersCount: nonNegativeIntegerSchema.optional(),
    followingCount: nonNegativeIntegerSchema.optional(),
    likeCount: nonNegativeIntegerSchema.optional(),
    listedCount: nonNegativeIntegerSchema.optional(),
    tweetCount: nonNegativeIntegerSchema.optional(),
  })
  .strict();

export const twitterOwnedPostSignalSchema = z
  .object({
    conversationId: z.string().trim().min(1).optional(),
    createdAt: timestampSchema.optional(),
    createTime: nonNegativeIntegerSchema.optional(),
    id: z.string().trim().min(1),
    impressionCount: nonNegativeIntegerSchema.optional(),
    inReplyToUserId: z.string().trim().min(1).optional(),
    isQuote: z.boolean().optional(),
    isReply: z.boolean().optional(),
    isRetweet: z.boolean().optional(),
    likeCount: nonNegativeIntegerSchema.optional(),
    quoteCount: nonNegativeIntegerSchema.optional(),
    replyCount: nonNegativeIntegerSchema.optional(),
    replySettings: z.string().optional(),
    retweetCount: nonNegativeIntegerSchema.optional(),
    text: z.string().optional(),
  })
  .strict();

const ownedPostsValueSchema = z
  .object({
    hasMore: z.boolean(),
    posts: z.array(twitterOwnedPostSignalSchema).max(20),
  })
  .strict();

const publishingCapabilityValueSchema = z
  .object({
    canPublish: z.boolean().optional(),
    canUploadMedia: z.boolean().optional(),
    isProtected: z.boolean().optional(),
  })
  .strict();

export const twitterGenfeedPublishOutcomeValues = [
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
            outcome: z.enum(twitterGenfeedPublishOutcomeValues),
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
  reason: twitterAuthorizedSignalReasonSchema.optional(),
  scope: twitterAuthorizedSignalScopeSchema,
  staleAt: timestampSchema.nullable(),
  status: twitterAuthorizedSignalStatusSchema,
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

const ownedPostsEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('owned-posts-snapshot'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: ownedPostsValueSchema.optional(),
  })
  .strict();

const publishingCapabilityEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('publishing-capability-snapshot'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: publishingCapabilityValueSchema.optional(),
  })
  .strict();

const firstUploadEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('first-upload-platform-signal'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: z
      .object({
        createdAt: timestampSchema.optional(),
        createTime: nonNegativeIntegerSchema.optional(),
        post: twitterOwnedPostSignalSchema.optional(),
      })
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
      .object({ posts: z.array(twitterOwnedPostSignalSchema).max(20) })
      .strict()
      .optional(),
  })
  .strict();

const nativeAccountAgeEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('native-account-age'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: z
      .object({
        createdAt: timestampSchema.optional(),
        createTime: nonNegativeIntegerSchema.optional(),
      })
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

export const twitterAuthorizedSignalEvidenceSchema = z.discriminatedUnion(
  'key',
  [
    profileEvidenceSchema,
    statisticsEvidenceSchema,
    ownedPostsEvidenceSchema,
    publishingCapabilityEvidenceSchema,
    firstUploadEvidenceSchema,
    ownedPostMetricsEvidenceSchema,
    nativeAccountAgeEvidenceSchema,
    genfeedPublishActivityEvidenceSchema,
  ],
);

export const twitterAuthorizedSignalsSnapshotSchema = z
  .object({
    credentialId: z.string().trim().min(1),
    evidence: z.array(twitterAuthorizedSignalEvidenceSchema).length(8),
    grantedScopes: z.array(z.string().trim().min(1)),
    platform: z.literal(CredentialPlatform.TWITTER),
    refreshAttemptedAt: timestampSchema,
    state: twitterAuthorizedSignalStateSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const keys = snapshot.evidence.map((evidence) => evidence.key);

    for (const expectedKey of twitterAuthorizedSignalEvidenceKeys) {
      const occurrences = keys.filter((key) => key === expectedKey).length;
      if (occurrences !== 1) {
        context.addIssue({
          code: 'custom',
          message: `Expected exactly one X warm-up evidence item for ${expectedKey}.`,
          path: ['evidence'],
        });
      }
    }
  });

export type TwitterAuthorizedSignalState = z.infer<
  typeof twitterAuthorizedSignalStateSchema
>;
export type TwitterAuthorizedSignalStatus = z.infer<
  typeof twitterAuthorizedSignalStatusSchema
>;
export type TwitterAuthorizedSignalReason = z.infer<
  typeof twitterAuthorizedSignalReasonSchema
>;
export type TwitterAuthorizedSignalEvidence = z.infer<
  typeof twitterAuthorizedSignalEvidenceSchema
>;
export type TwitterOwnedPostSignal = z.infer<
  typeof twitterOwnedPostSignalSchema
>;
export type TwitterAuthorizedSignalsSnapshot = z.infer<
  typeof twitterAuthorizedSignalsSnapshotSchema
>;
