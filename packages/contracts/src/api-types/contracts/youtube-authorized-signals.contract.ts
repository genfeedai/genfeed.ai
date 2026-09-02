import { z } from 'zod';
import { CredentialPlatform } from '../..';

import { socialWarmupProvenanceSchema } from './social-warmup-blueprint.contract';

export const youtubeAuthorizedSignalStateValues = [
  'full',
  'partial',
  'revoked',
  'empty',
  'stale',
] as const;

export const youtubeAuthorizedSignalStatusValues = [
  'available',
  'empty',
  'permission_limited',
  'unavailable',
  'revoked',
  'stale',
] as const;

export const youtubeAuthorizedSignalReasonValues = [
  'missing_scope',
  'empty_response',
  'authorization_revoked',
  'rate_limited',
  'provider_error',
  'channel_selection_required',
] as const;

export const youtubeAuthorizedSignalEvidenceKeys = [
  'channel-fields-platform-signal',
  'owned-uploads-snapshot',
  'publishing-capability-snapshot',
  'owned-video-analytics-snapshot',
  'first-upload-platform-signal',
  'native-account-age',
  'genfeed-publish-outcomes-observed',
] as const;

export const youtubeAuthorizedSignalStateSchema = z.enum(
  youtubeAuthorizedSignalStateValues,
);
export const youtubeAuthorizedSignalStatusSchema = z.enum(
  youtubeAuthorizedSignalStatusValues,
);
export const youtubeAuthorizedSignalReasonSchema = z.enum(
  youtubeAuthorizedSignalReasonValues,
);

const timestampSchema = z.iso.datetime();
const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const youtubeAuthorizedSignalScopeSchema = z
  .object({
    granted: z.array(z.string().trim().min(1)),
    missing: z.array(z.string().trim().min(1)),
    required: z.array(z.string().trim().min(1)),
  })
  .strict();

const fieldAvailabilitySchema = z.record(
  z.string().trim().min(1),
  youtubeAuthorizedSignalStatusSchema,
);

const channelValueSchema = z
  .object({
    customUrl: z.string().optional(),
    description: z.string().optional(),
    hiddenSubscriberCount: z.boolean().optional(),
    id: z.string().optional(),
    publishedAt: timestampSchema.optional(),
    subscriberCount: nonNegativeIntegerSchema.optional(),
    thumbnailUrl: z.string().url().optional(),
    title: z.string().optional(),
    videoCount: nonNegativeIntegerSchema.optional(),
    viewCount: nonNegativeIntegerSchema.optional(),
  })
  .strict();

export const youtubeOwnedUploadSignalSchema = z
  .object({
    commentCount: nonNegativeIntegerSchema.optional(),
    createTime: nonNegativeIntegerSchema.optional(),
    durationSeconds: nonNegativeIntegerSchema.optional(),
    id: z.string().trim().min(1),
    likeCount: nonNegativeIntegerSchema.optional(),
    mediaType: z.string().optional(),
    publishedAt: timestampSchema.optional(),
    title: z.string().optional(),
    viewCount: nonNegativeIntegerSchema.optional(),
  })
  .strict();

const ownedUploadsValueSchema = z
  .object({
    hasMore: z.boolean(),
    videos: z.array(youtubeOwnedUploadSignalSchema).max(20),
  })
  .strict();

const publishingCapabilityValueSchema = z
  .object({
    canPublish: z.boolean().optional(),
    channelId: z.string().optional(),
    isLinked: z.boolean().optional(),
    longUploadsStatus: z.string().optional(),
    privacyStatus: z.string().optional(),
  })
  .strict();

export const youtubeOwnedVideoAnalyticsSignalSchema = z
  .object({
    averageViewDurationSeconds: nonNegativeIntegerSchema.optional(),
    averageViewPercentage: z.number().nonnegative().optional(),
    id: z.string().trim().min(1),
    impressions: nonNegativeIntegerSchema.optional(),
    impressionsClickThroughRate: z.number().nonnegative().optional(),
    views: nonNegativeIntegerSchema.optional(),
  })
  .strict();

const ownedVideoAnalyticsValueSchema = z
  .object({
    videos: z.array(youtubeOwnedVideoAnalyticsSignalSchema).max(20),
  })
  .strict();

export const youtubeGenfeedPublishOutcomeValues = [
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
            mediaType: z.string().optional(),
            outcome: z.enum(youtubeGenfeedPublishOutcomeValues),
            postId: z.string().trim().min(1),
            sourcePostId: z.string().trim().min(1).optional(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

const evidenceMetadataShape = {
  fieldAvailability: fieldAvailabilitySchema,
  observedAt: timestampSchema.nullable(),
  reason: youtubeAuthorizedSignalReasonSchema.optional(),
  scope: youtubeAuthorizedSignalScopeSchema,
  staleAt: timestampSchema.nullable(),
  status: youtubeAuthorizedSignalStatusSchema,
};

const channelEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('channel-fields-platform-signal'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: channelValueSchema.optional(),
  })
  .strict();

const ownedUploadsEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('owned-uploads-snapshot'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: ownedUploadsValueSchema.optional(),
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

const ownedVideoAnalyticsEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('owned-video-analytics-snapshot'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: ownedVideoAnalyticsValueSchema.optional(),
  })
  .strict();

const firstUploadEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('first-upload-platform-signal'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: z
      .object({ video: youtubeOwnedUploadSignalSchema.optional() })
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
    key: z.literal('genfeed-publish-outcomes-observed'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.genfeed_observed),
    value: genfeedPublishActivityValueSchema,
  })
  .strict();

export const youtubeAuthorizedSignalEvidenceSchema = z.discriminatedUnion(
  'key',
  [
    channelEvidenceSchema,
    ownedUploadsEvidenceSchema,
    publishingCapabilityEvidenceSchema,
    ownedVideoAnalyticsEvidenceSchema,
    firstUploadEvidenceSchema,
    nativeAccountAgeEvidenceSchema,
    genfeedPublishActivityEvidenceSchema,
  ],
);

export const youtubeAuthorizedSignalsSnapshotSchema = z
  .object({
    credentialId: z.string().trim().min(1),
    evidence: z.array(youtubeAuthorizedSignalEvidenceSchema).length(7),
    grantedScopes: z.array(z.string().trim().min(1)),
    platform: z.literal(CredentialPlatform.YOUTUBE),
    refreshAttemptedAt: timestampSchema,
    state: youtubeAuthorizedSignalStateSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const keys = snapshot.evidence.map((evidence) => evidence.key);

    for (const expectedKey of youtubeAuthorizedSignalEvidenceKeys) {
      const occurrences = keys.filter((key) => key === expectedKey).length;
      if (occurrences !== 1) {
        context.addIssue({
          code: 'custom',
          message: `Expected exactly one YouTube warm-up evidence item for ${expectedKey}.`,
          path: ['evidence'],
        });
      }
    }
  });

export type YoutubeAuthorizedSignalState = z.infer<
  typeof youtubeAuthorizedSignalStateSchema
>;
export type YoutubeAuthorizedSignalStatus = z.infer<
  typeof youtubeAuthorizedSignalStatusSchema
>;
export type YoutubeAuthorizedSignalReason = z.infer<
  typeof youtubeAuthorizedSignalReasonSchema
>;
export type YoutubeAuthorizedSignalEvidence = z.infer<
  typeof youtubeAuthorizedSignalEvidenceSchema
>;
export type YoutubeOwnedUploadSignal = z.infer<
  typeof youtubeOwnedUploadSignalSchema
>;
export type YoutubeOwnedVideoAnalyticsSignal = z.infer<
  typeof youtubeOwnedVideoAnalyticsSignalSchema
>;
export type YoutubeAuthorizedSignalsSnapshot = z.infer<
  typeof youtubeAuthorizedSignalsSnapshotSchema
>;
