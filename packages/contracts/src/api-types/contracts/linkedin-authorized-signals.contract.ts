import { z } from 'zod';
import { CredentialPlatform } from '../..';

import { socialWarmupProvenanceSchema } from './social-warmup-blueprint.contract';

export const linkedinAuthorizedSignalStateValues = [
  'full',
  'partial',
  'revoked',
  'empty',
  'stale',
] as const;

export const linkedinAuthorizedSignalStatusValues = [
  'available',
  'empty',
  'permission_limited',
  'unavailable',
  'revoked',
  'stale',
] as const;

export const linkedinAuthorizedSignalReasonValues = [
  'missing_scope',
  'empty_response',
  'authorization_revoked',
  'rate_limited',
  'provider_error',
  'organization_page_selection_required',
] as const;

export const linkedinAuthorizedSignalEvidenceKeys = [
  'member-profile-fields-platform-signal',
  'organization-page-snapshot',
  'member-publishing-capability-snapshot',
  'organization-publishing-capability-snapshot',
  'owned-posts-snapshot',
  'owned-post-performance-snapshot',
  'first-publish-platform-signal',
  'genfeed-publish-outcomes-observed',
] as const;

export const linkedinAuthorizedSignalStateSchema = z.enum(
  linkedinAuthorizedSignalStateValues,
);
export const linkedinAuthorizedSignalStatusSchema = z.enum(
  linkedinAuthorizedSignalStatusValues,
);
export const linkedinAuthorizedSignalReasonSchema = z.enum(
  linkedinAuthorizedSignalReasonValues,
);

const timestampSchema = z.iso.datetime();
const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const linkedinAuthorizedSignalScopeSchema = z
  .object({
    granted: z.array(z.string().trim().min(1)),
    missing: z.array(z.string().trim().min(1)),
    required: z.array(z.string().trim().min(1)),
  })
  .strict();

const fieldAvailabilitySchema = z.record(
  z.string().trim().min(1),
  linkedinAuthorizedSignalStatusSchema,
);

const memberProfileValueSchema = z
  .object({
    accountKind: z.literal('member').optional(),
    email: z.string().optional(),
    firstName: z.string().optional(),
    id: z.string().optional(),
    lastName: z.string().optional(),
    name: z.string().optional(),
    picture: z.string().url().optional(),
  })
  .strict();

const organizationPageValueSchema = z
  .object({
    accountKind: z.literal('organization').optional(),
    id: z.string().optional(),
    name: z.string().optional(),
    role: z.string().optional(),
    vanityName: z.string().optional(),
  })
  .strict();

const memberPublishingCapabilityValueSchema = z
  .object({
    accountKind: z.literal('member').optional(),
    canPublish: z.boolean().optional(),
    personUrn: z.string().optional(),
  })
  .strict();

const organizationPublishingCapabilityValueSchema = z
  .object({
    accountKind: z.literal('organization').optional(),
    canPublish: z.boolean().optional(),
    organizationId: z.string().optional(),
    organizationUrn: z.string().optional(),
  })
  .strict();

export const linkedinOwnedPostSignalSchema = z
  .object({
    authorUrn: z.string().optional(),
    commentCount: nonNegativeIntegerSchema.optional(),
    createTime: nonNegativeIntegerSchema.optional(),
    id: z.string().trim().min(1),
    likeCount: nonNegativeIntegerSchema.optional(),
    mediaType: z.string().optional(),
    text: z.string().optional(),
  })
  .strict();

const ownedPostsValueSchema = z
  .object({
    hasMore: z.boolean(),
    posts: z.array(linkedinOwnedPostSignalSchema).max(20),
  })
  .strict();

export const linkedinOwnedPostPerformanceSignalSchema = z
  .object({
    clicks: nonNegativeIntegerSchema.optional(),
    commentCount: nonNegativeIntegerSchema.optional(),
    id: z.string().trim().min(1),
    impressions: nonNegativeIntegerSchema.optional(),
    likeCount: nonNegativeIntegerSchema.optional(),
    shares: nonNegativeIntegerSchema.optional(),
    views: nonNegativeIntegerSchema.optional(),
  })
  .strict();

const ownedPostPerformanceValueSchema = z
  .object({
    posts: z.array(linkedinOwnedPostPerformanceSignalSchema).max(20),
  })
  .strict();

export const linkedinGenfeedPublishOutcomeValues = [
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
            outcome: z.enum(linkedinGenfeedPublishOutcomeValues),
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
  reason: linkedinAuthorizedSignalReasonSchema.optional(),
  scope: linkedinAuthorizedSignalScopeSchema,
  staleAt: timestampSchema.nullable(),
  status: linkedinAuthorizedSignalStatusSchema,
};

const memberProfileEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('member-profile-fields-platform-signal'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: memberProfileValueSchema.optional(),
  })
  .strict();

const organizationPageEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('organization-page-snapshot'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: organizationPageValueSchema.optional(),
  })
  .strict();

const memberPublishingCapabilityEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('member-publishing-capability-snapshot'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: memberPublishingCapabilityValueSchema.optional(),
  })
  .strict();

const organizationPublishingCapabilityEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('organization-publishing-capability-snapshot'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: organizationPublishingCapabilityValueSchema.optional(),
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

const ownedPostPerformanceEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('owned-post-performance-snapshot'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: ownedPostPerformanceValueSchema.optional(),
  })
  .strict();

const firstPublishEvidenceSchema = z
  .object({
    ...evidenceMetadataShape,
    key: z.literal('first-publish-platform-signal'),
    provenance: z.literal(socialWarmupProvenanceSchema.enum.platform_verified),
    value: z
      .object({ post: linkedinOwnedPostSignalSchema.optional() })
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

export const linkedinAuthorizedSignalEvidenceSchema = z.discriminatedUnion(
  'key',
  [
    memberProfileEvidenceSchema,
    organizationPageEvidenceSchema,
    memberPublishingCapabilityEvidenceSchema,
    organizationPublishingCapabilityEvidenceSchema,
    ownedPostsEvidenceSchema,
    ownedPostPerformanceEvidenceSchema,
    firstPublishEvidenceSchema,
    genfeedPublishActivityEvidenceSchema,
  ],
);

export const linkedinAuthorizedSignalsSnapshotSchema = z
  .object({
    credentialId: z.string().trim().min(1),
    evidence: z.array(linkedinAuthorizedSignalEvidenceSchema).length(8),
    grantedScopes: z.array(z.string().trim().min(1)),
    platform: z.literal(CredentialPlatform.LINKEDIN),
    refreshAttemptedAt: timestampSchema,
    state: linkedinAuthorizedSignalStateSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const keys = snapshot.evidence.map((evidence) => evidence.key);

    for (const expectedKey of linkedinAuthorizedSignalEvidenceKeys) {
      const occurrences = keys.filter((key) => key === expectedKey).length;
      if (occurrences !== 1) {
        context.addIssue({
          code: 'custom',
          message: `Expected exactly one LinkedIn warm-up evidence item for ${expectedKey}.`,
          path: ['evidence'],
        });
      }
    }
  });

export type LinkedinAuthorizedSignalState = z.infer<
  typeof linkedinAuthorizedSignalStateSchema
>;
export type LinkedinAuthorizedSignalStatus = z.infer<
  typeof linkedinAuthorizedSignalStatusSchema
>;
export type LinkedinAuthorizedSignalReason = z.infer<
  typeof linkedinAuthorizedSignalReasonSchema
>;
export type LinkedinAuthorizedSignalEvidence = z.infer<
  typeof linkedinAuthorizedSignalEvidenceSchema
>;
export type LinkedinOwnedPostSignal = z.infer<
  typeof linkedinOwnedPostSignalSchema
>;
export type LinkedinOwnedPostPerformanceSignal = z.infer<
  typeof linkedinOwnedPostPerformanceSignalSchema
>;
export type LinkedinAuthorizedSignalsSnapshot = z.infer<
  typeof linkedinAuthorizedSignalsSnapshotSchema
>;
