import { z } from 'zod';
import { CredentialPlatform } from '../..';

import { socialWarmupProvenanceSchema } from './social-warmup-blueprint.contract';

export const instagramAuthorizedSignalStateValues = [
  'full',
  'partial',
  'revoked',
  'empty',
  'stale',
] as const;

export const instagramAuthorizedSignalStatusValues = [
  'available',
  'empty',
  'permission_limited',
  'unavailable',
  'revoked',
  'stale',
] as const;

export const instagramAuthorizedSignalReasonValues = [
  'missing_scope',
  'empty_response',
  'authorization_revoked',
  'rate_limited',
  'provider_error',
  'professional_account_limited',
] as const;

export const instagramAuthorizedSignalEvidenceKeys = [
  'profile-fields-platform-signal',
  'owned-media-snapshot',
  'publishing-capability-snapshot',
  'media-performance-snapshot',
  'first-publish-platform-signal',
  'genfeed-publish-outcomes-observed',
] as const;

export const instagramAuthorizedSignalStateSchema = z.enum(
  instagramAuthorizedSignalStateValues,
);
export const instagramAuthorizedSignalStatusSchema = z.enum(
  instagramAuthorizedSignalStatusValues,
);
export const instagramAuthorizedSignalReasonSchema = z.enum(
  instagramAuthorizedSignalReasonValues,
);

const timestampSchema = z.iso.datetime();
const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const instagramAuthorizedSignalScopeSchema = z
  .object({
    granted: z.array(z.string().trim().min(1)),
    missing: z.array(z.string().trim().min(1)),
    required: z.array(z.string().trim().min(1)),
  })
  .strict();

const fieldAvailabilitySchema = z.record(
  z.string().trim().min(1),
  instagramAuthorizedSignalStatusSchema,
);

const profileValueSchema = z
  .object({
    accountType: z.string().optional(),
    biography: z.string().optional(),
    followersCount: nonNegativeIntegerSchema.optional(),
    followsCount: nonNegativeIntegerSchema.optional(),
    mediaCount: nonNegativeIntegerSchema.optional(),
    name: z.string().optional(),
    profilePictureUrl: z.string().url().optional(),
    username: z.string().optional(),
    website: z.string().optional(),
  })
  .strict();

export const instagramOwnedMediaSignalSchema = z
  .object({
    caption: z.string().optional(),
    commentCount: nonNegativeIntegerSchema.optional(),
    createTime: nonNegativeIntegerSchema.optional(),
    id: z.string().trim().min(1),
    likeCount: nonNegativeIntegerSchema.optional(),
    mediaProductType: z.string().optional(),
    mediaType: z.string().optional(),
    permalink: z.string().url().optional(),
    shortcode: z.string().optional(),
  })
  .strict();

const ownedMediaValueSchema = z
  .object({
    hasMore: z.boolean(),
    media: z.array(instagramOwnedMediaSignalSchema).max(20),
  })
  .strict();

const publishingCapabilityValueSchema = z
  .object({
    accountType: z.string().optional(),
    canPublish: z.boolean().optional(),
    isProfessionalAccount: z.boolean().optional(),
  })
  .strict();

export const instagramMediaPerformanceSignalSchema = z
  .object({
    commentCount: nonNegativeIntegerSchema.optional(),
    id: z.string().trim().min(1),
    impressions: nonNegativeIntegerSchema.optional(),
    likeCount: nonNegativeIntegerSchema.optional(),
    reach: nonNegativeIntegerSchema.optional(),
    saved: nonNegativeIntegerSchema.optional(),
    shares: nonNegativeIntegerSchema.optional(),
    totalInteractions: nonNegativeIntegerSchema.optional(),
  })
  .strict();

const mediaPerformanceValueSchema = z
  .object({
    media: z.array(instagramMediaPerformanceSignalSchema).max(20),
  })
  .strict();

export const instagramGenfeedPublishOutcomeValues = [
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
            outcome: z.enum(instagramGenfeedPublishOutcomeValues),
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
  reason: instagramAuthorizedSignalReasonSchema.optional(),
  scope: instagramAuthorizedSignalScopeSchema,
  staleAt: timestampSchema.nullable(),
  status: instagramAuthorizedSignalStatusSchema,
};

const profileEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('profile-fields-platform-signal'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: profileValueSchema.optional(),
  })
  .strict();

const ownedMediaEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('owned-media-snapshot'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: ownedMediaValueSchema.optional(),
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

const mediaPerformanceEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('media-performance-snapshot'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: mediaPerformanceValueSchema.optional(),
  })
  .strict();

const firstPublishEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('first-publish-platform-signal'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: z
      .object({ media: instagramOwnedMediaSignalSchema.optional() })
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

export const instagramAuthorizedSignalEvidenceSchema = z.discriminatedUnion(
  'key',
  [
    profileEvidenceSchema,
    ownedMediaEvidenceSchema,
    publishingCapabilityEvidenceSchema,
    mediaPerformanceEvidenceSchema,
    firstPublishEvidenceSchema,
    genfeedPublishActivityEvidenceSchema,
  ],
);

export const instagramAuthorizedSignalsSnapshotSchema = z
  .object({
    credentialId: z.string().trim().min(1),
    evidence: z.array(instagramAuthorizedSignalEvidenceSchema).length(6),
    grantedScopes: z.array(z.string().trim().min(1)),
    platform: z.literal(CredentialPlatform.INSTAGRAM),
    refreshAttemptedAt: timestampSchema,
    state: instagramAuthorizedSignalStateSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const keys = snapshot.evidence.map((evidence) => evidence.key);

    for (const expectedKey of instagramAuthorizedSignalEvidenceKeys) {
      const occurrences = keys.filter((key) => key === expectedKey).length;
      if (occurrences !== 1) {
        context.addIssue({
          code: 'custom',
          message: `Expected exactly one Instagram warm-up evidence item for ${expectedKey}.`,
          path: ['evidence'],
        });
      }
    }
  });

export type InstagramAuthorizedSignalState = z.infer<
  typeof instagramAuthorizedSignalStateSchema
>;
export type InstagramAuthorizedSignalStatus = z.infer<
  typeof instagramAuthorizedSignalStatusSchema
>;
export type InstagramAuthorizedSignalReason = z.infer<
  typeof instagramAuthorizedSignalReasonSchema
>;
export type InstagramAuthorizedSignalEvidence = z.infer<
  typeof instagramAuthorizedSignalEvidenceSchema
>;
export type InstagramOwnedMediaSignal = z.infer<
  typeof instagramOwnedMediaSignalSchema
>;
export type InstagramMediaPerformanceSignal = z.infer<
  typeof instagramMediaPerformanceSignalSchema
>;
export type InstagramAuthorizedSignalsSnapshot = z.infer<
  typeof instagramAuthorizedSignalsSnapshotSchema
>;
