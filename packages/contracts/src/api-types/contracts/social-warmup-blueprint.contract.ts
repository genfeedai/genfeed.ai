/**
 * Canonical social account warm-up blueprint contract.
 *
 * Definitions are versioned content. Enrollments persist `id` + `version` and
 * resolve that exact pair so publishing a new revision never changes an active
 * or historical enrollment. Platform adapters and enrollment persistence are
 * intentionally outside this contract (guided warm-up epic #2212, issue #2213).
 */

import { z } from 'zod';
import { CredentialPlatform } from '../..';

export const socialWarmupProvenanceValues = [
  'platform_verified',
  'genfeed_observed',
  'user_confirmed',
] as const;

export const socialWarmupCompletionTypeValues = [
  'attestation',
  'signal',
  'event',
] as const;

export const socialWarmupRequirementValues = [
  'required',
  'required_when_available',
  'optional',
] as const;

export const socialWarmupEvidenceKindValues = [
  'platform_documentation',
  'product_guidance',
] as const;

export const socialWarmupProvenanceSchema = z.enum(
  socialWarmupProvenanceValues,
);
export const socialWarmupCompletionTypeSchema = z.enum(
  socialWarmupCompletionTypeValues,
);
export const socialWarmupRequirementSchema = z.enum(
  socialWarmupRequirementValues,
);
export const socialWarmupEvidenceKindSchema = z.enum(
  socialWarmupEvidenceKindValues,
);

const socialWarmupIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const socialWarmupTextSchema = z.string().trim().min(1).max(2_000);
const socialWarmupDateSchema = z.iso.date();

export const socialWarmupCompletionSchema = z
  .object({
    description: socialWarmupTextSchema,
    key: socialWarmupIdSchema,
    type: socialWarmupCompletionTypeSchema,
  })
  .strict();

export const socialWarmupEvidenceSchema = z
  .object({
    id: socialWarmupIdSchema,
    kind: socialWarmupEvidenceKindSchema,
    reference: z.string().trim().min(1).max(2_000),
    reviewedOn: socialWarmupDateSchema,
    title: socialWarmupTextSchema,
  })
  .strict();

const socialWarmupCheckShape = {
  completion: socialWarmupCompletionSchema,
  description: socialWarmupTextSchema,
  evidenceIds: z.array(socialWarmupIdSchema).min(1).max(20),
  id: socialWarmupIdSchema,
  provenance: socialWarmupProvenanceSchema,
  requirement: socialWarmupRequirementSchema,
  title: socialWarmupTextSchema,
};

export const socialWarmupStepSchema = z
  .object({
    ...socialWarmupCheckShape,
    days: z.array(z.number().int().positive()).min(1).max(31),
  })
  .strict()
  .superRefine((step, context) => {
    const expectedCompletionByProvenance = {
      genfeed_observed: 'event',
      platform_verified: 'signal',
      user_confirmed: 'attestation',
    } as const satisfies Record<
      z.infer<typeof socialWarmupProvenanceSchema>,
      z.infer<typeof socialWarmupCompletionTypeSchema>
    >;

    if (
      step.completion.type !== expectedCompletionByProvenance[step.provenance]
    ) {
      context.addIssue({
        code: 'custom',
        message: `Completion type ${step.completion.type} does not match ${step.provenance} provenance.`,
        path: ['completion', 'type'],
      });
    }
  });

export const socialWarmupPhaseSchema = z
  .object({
    description: socialWarmupTextSchema,
    endDay: z.number().int().positive(),
    id: socialWarmupIdSchema,
    startDay: z.number().int().positive(),
    steps: z.array(socialWarmupStepSchema).min(1).max(50),
    title: socialWarmupTextSchema,
  })
  .strict()
  .refine((phase) => phase.endDay >= phase.startDay, {
    message: 'A warm-up phase cannot end before it starts.',
    path: ['endDay'],
  });

export const socialWarmupGraduationRuleSchema = z
  .object(socialWarmupCheckShape)
  .strict()
  .superRefine((rule, context) => {
    const expectedCompletionByProvenance = {
      genfeed_observed: 'event',
      platform_verified: 'signal',
      user_confirmed: 'attestation',
    } as const satisfies Record<
      z.infer<typeof socialWarmupProvenanceSchema>,
      z.infer<typeof socialWarmupCompletionTypeSchema>
    >;

    if (
      rule.completion.type !== expectedCompletionByProvenance[rule.provenance]
    ) {
      context.addIssue({
        code: 'custom',
        message: `Completion type ${rule.completion.type} does not match ${rule.provenance} provenance.`,
        path: ['completion', 'type'],
      });
    }
  });

export const socialWarmupGraduationSchema = z
  .object({
    disclaimer: socialWarmupTextSchema,
    minimumElapsedDays: z.number().int().positive(),
    recommendedElapsedDays: z.number().int().positive(),
    rules: z.array(socialWarmupGraduationRuleSchema).min(1).max(30),
  })
  .strict()
  .refine(
    (graduation) =>
      graduation.recommendedElapsedDays >= graduation.minimumElapsedDays,
    {
      message: 'Recommended elapsed days cannot be below the minimum.',
      path: ['recommendedElapsedDays'],
    },
  );

export const socialWarmupBlueprintSchema = z
  .object({
    evidenceBasis: z.array(socialWarmupEvidenceSchema).min(1).max(50),
    graduation: socialWarmupGraduationSchema,
    id: socialWarmupIdSchema,
    lastReviewedOn: socialWarmupDateSchema,
    phases: z.array(socialWarmupPhaseSchema).min(1).max(20),
    platform: z.nativeEnum(CredentialPlatform),
    summary: socialWarmupTextSchema,
    title: socialWarmupTextSchema,
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((blueprint, context) => {
    const evidenceIds = new Set<string>();
    const phaseIds = new Set<string>();
    const checkIds = new Set<string>();
    let previousEndDay = 0;

    for (const [index, evidence] of blueprint.evidenceBasis.entries()) {
      if (evidenceIds.has(evidence.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate evidence id: ${evidence.id}`,
          path: ['evidenceBasis', index, 'id'],
        });
      }
      evidenceIds.add(evidence.id);
    }

    const validateCheck = (
      check: { evidenceIds: string[]; id: string },
      path: (string | number)[],
    ): void => {
      if (checkIds.has(check.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate step or graduation rule id: ${check.id}`,
          path: [...path, 'id'],
        });
      }
      checkIds.add(check.id);

      for (const [evidenceIndex, evidenceId] of check.evidenceIds.entries()) {
        if (!evidenceIds.has(evidenceId)) {
          context.addIssue({
            code: 'custom',
            message: `Unknown evidence id: ${evidenceId}`,
            path: [...path, 'evidenceIds', evidenceIndex],
          });
        }
      }
    };

    for (const [phaseIndex, phase] of blueprint.phases.entries()) {
      if (phaseIds.has(phase.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate phase id: ${phase.id}`,
          path: ['phases', phaseIndex, 'id'],
        });
      }
      phaseIds.add(phase.id);

      if (phase.startDay <= previousEndDay) {
        context.addIssue({
          code: 'custom',
          message: 'Warm-up phases must be ordered and non-overlapping.',
          path: ['phases', phaseIndex, 'startDay'],
        });
      }
      previousEndDay = phase.endDay;

      for (const [stepIndex, step] of phase.steps.entries()) {
        const assignedDays = new Set<number>();

        for (const [dayIndex, day] of step.days.entries()) {
          if (day < phase.startDay || day > phase.endDay) {
            context.addIssue({
              code: 'custom',
              message: `Step day ${day} falls outside phase days ${phase.startDay}–${phase.endDay}.`,
              path: [
                'phases',
                phaseIndex,
                'steps',
                stepIndex,
                'days',
                dayIndex,
              ],
            });
          }

          if (assignedDays.has(day)) {
            context.addIssue({
              code: 'custom',
              message: `Duplicate assigned step day: ${day}`,
              path: [
                'phases',
                phaseIndex,
                'steps',
                stepIndex,
                'days',
                dayIndex,
              ],
            });
          }
          assignedDays.add(day);
        }

        validateCheck(step, ['phases', phaseIndex, 'steps', stepIndex]);
      }
    }

    for (const [ruleIndex, rule] of blueprint.graduation.rules.entries()) {
      validateCheck(rule, ['graduation', 'rules', ruleIndex]);
    }
  });

export const socialWarmupBlueprintReferenceSchema = z
  .object({
    id: socialWarmupIdSchema,
    version: z.number().int().positive(),
  })
  .strict();

export type SocialWarmupProvenance = z.infer<
  typeof socialWarmupProvenanceSchema
>;
export type SocialWarmupCompletionType = z.infer<
  typeof socialWarmupCompletionTypeSchema
>;
export type SocialWarmupRequirement = z.infer<
  typeof socialWarmupRequirementSchema
>;
export type SocialWarmupStep = z.infer<typeof socialWarmupStepSchema>;
export type SocialWarmupPhase = z.infer<typeof socialWarmupPhaseSchema>;
export type SocialWarmupBlueprint = z.infer<typeof socialWarmupBlueprintSchema>;
export type SocialWarmupBlueprintReference = z.infer<
  typeof socialWarmupBlueprintReferenceSchema
>;

export const TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID = 'social-warmup.tiktok';
export const TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION = 1;

export const TIKTOK_SOCIAL_WARMUP_BLUEPRINT = socialWarmupBlueprintSchema.parse(
  {
    evidenceBasis: [
      {
        id: 'tiktok-product-guidance',
        kind: 'product_guidance',
        reference: 'skills/tiktok-warmup/SKILL.md',
        reviewedOn: '2026-08-11',
        title: 'Genfeed TikTok warm-up long-form guidance',
      },
      {
        id: 'tiktok-api-scopes',
        kind: 'platform_documentation',
        reference:
          'https://developers.tiktok.com/doc/tiktok-api-scopes?enter_method=left_navigation',
        reviewedOn: '2026-08-11',
        title: 'TikTok API scopes',
      },
      {
        id: 'tiktok-user-info',
        kind: 'platform_documentation',
        reference:
          'https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/',
        reviewedOn: '2026-08-11',
        title: 'TikTok Get User Info',
      },
      {
        id: 'tiktok-display-api',
        kind: 'platform_documentation',
        reference: 'https://developers.tiktok.com/doc/display-api-overview',
        reviewedOn: '2026-08-11',
        title: 'TikTok Display API overview',
      },
      {
        id: 'tiktok-direct-post',
        kind: 'platform_documentation',
        reference:
          'https://developers.tiktok.com/doc/content-posting-api-reference-direct-post',
        reviewedOn: '2026-08-11',
        title: 'TikTok Content Posting API Direct Post',
      },
      {
        id: 'tiktok-post-status',
        kind: 'platform_documentation',
        reference:
          'https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status',
        reviewedOn: '2026-08-11',
        title: 'TikTok Content Posting API post status',
      },
    ],
    graduation: {
      disclaimer:
        'Graduation means the configured steps have enough evidence to begin a gradual publishing cadence. It does not guarantee reach, distribution, or freedom from moderation.',
      minimumElapsedDays: 5,
      recommendedElapsedDays: 7,
      rules: [
        {
          completion: {
            description:
              'The user has confirmed the required native-app consumption and niche-engagement actions.',
            key: 'manual-foundation-confirmed',
            type: 'attestation',
          },
          description:
            'Complete the native-app foundation without representing private engagement behavior as API telemetry.',
          evidenceIds: ['tiktok-product-guidance'],
          id: 'manual-foundation-complete',
          provenance: 'user_confirmed',
          requirement: 'required',
          title: 'Native-app foundation confirmed',
        },
        {
          completion: {
            description:
              'Authorized profile, statistics, public-video, and creator-capability signals have been refreshed.',
            key: 'authorized-account-snapshot',
            type: 'signal',
          },
          description:
            'Use only fields granted by the creator; missing scopes remain unavailable rather than false.',
          evidenceIds: [
            'tiktok-api-scopes',
            'tiktok-user-info',
            'tiktok-display-api',
            'tiktok-direct-post',
          ],
          id: 'authorized-signals-refreshed',
          provenance: 'platform_verified',
          requirement: 'required_when_available',
          title: 'Authorized signals refreshed',
        },
        {
          completion: {
            description:
              'TikTok exposes an owned public upload or a completed authorized publish status.',
            key: 'first-upload-observed',
            type: 'signal',
          },
          description:
            'Observe the first upload through authorized public-video or posting-status data when available.',
          evidenceIds: ['tiktok-display-api', 'tiktok-post-status'],
          id: 'first-upload-platform-observed',
          provenance: 'platform_verified',
          requirement: 'required_when_available',
          title: 'First upload observed',
        },
        {
          completion: {
            description:
              'Genfeed has recorded any applicable schedule, publish, or failure outcomes without replacing them with inferred platform behavior.',
            key: 'genfeed-publish-outcomes-observed',
            type: 'event',
          },
          description:
            'Review unresolved Genfeed failures before increasing cadence.',
          evidenceIds: ['tiktok-product-guidance', 'tiktok-post-status'],
          id: 'genfeed-outcomes-reviewed',
          provenance: 'genfeed_observed',
          requirement: 'required_when_available',
          title: 'Genfeed outcomes reviewed',
        },
      ],
    },
    id: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
    lastReviewedOn: '2026-08-11',
    phases: [
      {
        description:
          'Use the TikTok mobile app manually to consume niche content and build a relevant feed before publishing.',
        endDay: 3,
        id: 'native-consumption-and-engagement',
        startDay: 1,
        steps: [
          {
            completion: {
              description:
                'The user confirms each session was performed manually in the TikTok mobile app.',
              key: 'manual-phone-use-confirmed',
              type: 'attestation',
            },
            description:
              'Use the native mobile app without automated scrolling, likes, follows, saves, or comments.',
            days: [1, 2, 3],
            evidenceIds: ['tiktok-product-guidance'],
            id: 'use-native-app-manually',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Use TikTok manually',
          },
          {
            completion: {
              description:
                'The user confirms they watched a representative set of niche videos rather than rapidly skipping every item.',
              key: 'niche-watch-session-confirmed',
              type: 'attestation',
            },
            description:
              'Search for niche topics and watch relevant videos long enough to understand them.',
            days: [1, 2, 3],
            evidenceIds: ['tiktok-product-guidance'],
            id: 'watch-niche-content',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Watch niche content',
          },
          {
            completion: {
              description:
                'The user confirms they liked and saved only content that was genuinely useful or representative.',
              key: 'likes-and-saves-confirmed',
              type: 'attestation',
            },
            description:
              'Like and save relevant examples selectively; do not automate or manufacture engagement.',
            days: [1, 2, 3],
            evidenceIds: ['tiktok-product-guidance'],
            id: 'like-and-save-selectively',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Like and save selectively',
          },
          {
            completion: {
              description:
                'The user confirms they followed active, relevant creators without bulk follow/unfollow behavior.',
              key: 'relevant-follows-confirmed',
              type: 'attestation',
            },
            description:
              'Follow a small set of creators whose audience, topics, or formats match the planned account.',
            days: [1, 2, 3],
            evidenceIds: ['tiktok-product-guidance'],
            id: 'follow-relevant-creators',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Follow relevant creators',
          },
          {
            completion: {
              description:
                'The user confirms comments were written manually and referred to the specific video.',
              key: 'contextual-comments-confirmed',
              type: 'attestation',
            },
            description:
              'Leave a small number of genuine, contextual comments; never reuse templated spam.',
            days: [1, 2, 3],
            evidenceIds: ['tiktok-product-guidance'],
            id: 'leave-contextual-comments',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Leave contextual comments',
          },
          {
            completion: {
              description:
                'The user confirms whether the For You feed is becoming more relevant to the intended niche.',
              key: 'fyp-relevance-confirmed',
              type: 'attestation',
            },
            description:
              'Record feed relevance as a user observation; the authorized APIs do not expose the For You feed.',
            days: [1, 2, 3],
            evidenceIds: ['tiktok-product-guidance', 'tiktok-api-scopes'],
            id: 'check-fyp-relevance',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Check feed relevance',
          },
        ],
        title: 'Native consumption and niche engagement',
      },
      {
        description:
          'Tune the visible profile and feed, refresh only authorized account signals, and prepare an original first upload.',
        endDay: 5,
        id: 'profile-and-feed-tuning',
        startDay: 4,
        steps: [
          {
            completion: {
              description:
                'Authorized profile fields show the configured display name, avatar, and any granted profile fields.',
              key: 'profile-completeness-signal',
              type: 'signal',
            },
            description:
              'Check profile completeness only from fields granted through user.info scopes.',
            days: [4],
            evidenceIds: ['tiktok-api-scopes', 'tiktok-user-info'],
            id: 'verify-profile-completeness',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Verify profile completeness',
          },
          {
            completion: {
              description:
                'Authorized follower, following, likes, and video counts are captured with an observation timestamp.',
              key: 'profile-statistics-snapshot',
              type: 'signal',
            },
            description:
              'Snapshot profile statistics only when the creator granted user.info.stats.',
            days: [4],
            evidenceIds: ['tiktok-api-scopes', 'tiktok-user-info'],
            id: 'snapshot-profile-statistics',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Snapshot profile statistics',
          },
          {
            completion: {
              description:
                'Authorized video.list data records the creator’s public videos, including an empty list.',
              key: 'public-videos-snapshot',
              type: 'signal',
            },
            description:
              'Read public owned videos only when the creator granted video.list.',
            days: [4],
            evidenceIds: ['tiktok-api-scopes', 'tiktok-display-api'],
            id: 'snapshot-public-videos',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Snapshot public videos',
          },
          {
            completion: {
              description:
                'Authorized creator information and posting scope expose the account’s available publish choices and restrictions.',
              key: 'creator-capabilities-snapshot',
              type: 'signal',
            },
            description:
              'Use creator-info and granted posting scopes to record capabilities without assuming unavailable options.',
            days: [4],
            evidenceIds: ['tiktok-api-scopes', 'tiktok-direct-post'],
            id: 'snapshot-creator-capabilities',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Snapshot creator capabilities',
          },
          {
            completion: {
              description:
                'The user confirms continued niche viewing and whether feed relevance improved or needs more tuning.',
              key: 'feed-tuning-confirmed',
              type: 'attestation',
            },
            description:
              'Continue selective niche consumption and correct irrelevant feed recommendations through ordinary native controls.',
            days: [4, 5],
            evidenceIds: ['tiktok-product-guidance'],
            id: 'continue-feed-tuning',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Continue feed tuning',
          },
          {
            completion: {
              description:
                'The user confirms an original, policy-compliant, niche-relevant first upload is ready.',
              key: 'first-upload-ready-confirmed',
              type: 'attestation',
            },
            description:
              'Prepare one useful first upload with original assets and an accurate caption; avoid unsupported promises or engagement bait.',
            days: [5],
            evidenceIds: ['tiktok-product-guidance'],
            id: 'prepare-first-upload',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Prepare the first upload',
          },
        ],
        title: 'Profile and feed tuning',
      },
      {
        description:
          'Publish gradually, continue normal engagement, and inspect real outcomes without diagnosing hidden ranking states.',
        endDay: 7,
        id: 'gradual-first-uploads',
        startDay: 6,
        steps: [
          {
            completion: {
              description:
                'Authorized public-video or posting-status data shows the first upload outcome.',
              key: 'first-upload-platform-signal',
              type: 'signal',
            },
            description:
              'Observe the first upload through available TikTok data; preserve processing, private, public, and failed outcomes distinctly.',
            days: [6],
            evidenceIds: ['tiktok-display-api', 'tiktok-post-status'],
            id: 'observe-first-upload',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Observe the first upload',
          },
          {
            completion: {
              description:
                'Authorized owned-post fields are captured with their observation timestamp.',
              key: 'owned-post-metrics-snapshot',
              type: 'signal',
            },
            description:
              'Review only metrics returned for the creator’s own posts; unavailable metrics remain unavailable.',
            days: [7],
            evidenceIds: ['tiktok-display-api'],
            id: 'snapshot-owned-post-metrics',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Snapshot owned-post metrics',
          },
          {
            completion: {
              description:
                'The user confirms normal native-app engagement continued after the first upload.',
              key: 'post-upload-engagement-confirmed',
              type: 'attestation',
            },
            description:
              'Continue ordinary niche viewing and genuine replies without automating engagement or chasing a fixed threshold.',
            days: [6, 7],
            evidenceIds: ['tiktok-product-guidance'],
            id: 'continue-post-upload-engagement',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Continue engagement after uploading',
          },
          {
            completion: {
              description:
                'Genfeed records schedule, publish, and failure activity as separate event outcomes.',
              key: 'genfeed-publish-activity',
              type: 'event',
            },
            description:
              'Use Genfeed’s own activity log for Genfeed actions; never present it as native watch or engagement telemetry.',
            days: [6, 7],
            evidenceIds: ['tiktok-product-guidance', 'tiktok-post-status'],
            id: 'observe-genfeed-publish-activity',
            provenance: 'genfeed_observed',
            requirement: 'required_when_available',
            title: 'Observe Genfeed publish activity',
          },
          {
            completion: {
              description:
                'Authorized public-video data shows a second original upload after the first outcome was reviewed.',
              key: 'second-upload-platform-signal',
              type: 'signal',
            },
            description:
              'A second upload is optional; add it only when the creator can maintain quality and the first outcome has no unresolved failure.',
            days: [7],
            evidenceIds: ['tiktok-display-api', 'tiktok-post-status'],
            id: 'observe-optional-second-upload',
            provenance: 'platform_verified',
            requirement: 'optional',
            title: 'Observe an optional second upload',
          },
        ],
        title: 'Gradual first uploads',
      },
    ],
    platform: CredentialPlatform.TIKTOK,
    summary:
      'A 5–7 day TikTok progression from manual native-app consumption and niche engagement, through profile and feed tuning, to gradual first uploads and continued engagement.',
    title: 'TikTok 5–7 day warm-up',
    version: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
  },
);

export const TWITTER_SOCIAL_WARMUP_BLUEPRINT_ID = 'social-warmup.twitter';
export const TWITTER_SOCIAL_WARMUP_BLUEPRINT_VERSION = 1;

/**
 * X/Twitter guided warm-up (#2219).
 * Reply-first participation, profile readiness, topic/graph consumption,
 * first originals/threads, assessment, gradual cadence. No automated engagement.
 */
export const TWITTER_SOCIAL_WARMUP_BLUEPRINT =
  socialWarmupBlueprintSchema.parse({
    evidenceBasis: [
      {
        id: 'x-product-guidance',
        kind: 'product_guidance',
        reference: 'skills/x-warmup/SKILL.md',
        reviewedOn: '2026-08-12',
        title: 'Genfeed X warm-up long-form guidance',
      },
      {
        id: 'x-api-overview',
        kind: 'platform_documentation',
        reference: 'https://docs.x.com/x-api/getting-started/about-x-api',
        reviewedOn: '2026-08-12',
        title: 'X API getting started',
      },
      {
        id: 'x-user-lookup',
        kind: 'platform_documentation',
        reference: 'https://docs.x.com/x-api/users/lookup/introduction',
        reviewedOn: '2026-08-12',
        title: 'X API user lookup',
      },
      {
        id: 'x-manage-tweets',
        kind: 'platform_documentation',
        reference: 'https://docs.x.com/x-api/posts/manage-tweets/introduction',
        reviewedOn: '2026-08-12',
        title: 'X API manage posts',
      },
      {
        id: 'x-timelines',
        kind: 'platform_documentation',
        reference: 'https://docs.x.com/x-api/posts/timelines/introduction',
        reviewedOn: '2026-08-12',
        title: 'X API timelines',
      },
    ],
    graduation: {
      disclaimer:
        'Graduation means the configured steps have enough evidence to begin a gradual publishing cadence. It does not guarantee reach, distribution, algorithm placement, or freedom from rate limits or enforcement.',
      minimumElapsedDays: 5,
      recommendedElapsedDays: 7,
      rules: [
        {
          completion: {
            description:
              'The user has confirmed required native-app consumption and reply-first participation.',
            key: 'manual-foundation-confirmed',
            type: 'attestation',
          },
          description:
            'Complete native-app foundation without representing private likes, follows, or bookmarks as API telemetry.',
          evidenceIds: ['x-product-guidance'],
          id: 'manual-foundation-complete',
          provenance: 'user_confirmed',
          requirement: 'required',
          title: 'Native-app foundation confirmed',
        },
        {
          completion: {
            description:
              'Authorized profile and owned-post signals have been refreshed when the connection tier allows.',
            key: 'authorized-account-snapshot',
            type: 'signal',
          },
          description:
            'Use only fields granted by the connected X app; free-tier and missing scopes remain unavailable rather than false.',
          evidenceIds: ['x-api-overview', 'x-user-lookup', 'x-timelines'],
          id: 'authorized-signals-refreshed',
          provenance: 'platform_verified',
          requirement: 'required_when_available',
          title: 'Authorized signals refreshed',
        },
        {
          completion: {
            description:
              'X exposes an owned original post or Genfeed has recorded a completed publish when available.',
            key: 'first-original-observed',
            type: 'signal',
          },
          description:
            'Observe the first original post through authorized timeline data or Genfeed publish status when available.',
          evidenceIds: ['x-timelines', 'x-manage-tweets'],
          id: 'first-original-platform-observed',
          provenance: 'platform_verified',
          requirement: 'required_when_available',
          title: 'First original observed',
        },
        {
          completion: {
            description:
              'Genfeed has recorded any applicable draft, publish, or failure outcomes without replacing them with inferred platform behavior.',
            key: 'genfeed-publish-outcomes-observed',
            type: 'event',
          },
          description:
            'Review unresolved Genfeed failures before increasing cadence.',
          evidenceIds: ['x-product-guidance', 'x-manage-tweets'],
          id: 'genfeed-outcomes-reviewed',
          provenance: 'genfeed_observed',
          requirement: 'required_when_available',
          title: 'Genfeed outcomes reviewed',
        },
      ],
    },
    id: TWITTER_SOCIAL_WARMUP_BLUEPRINT_ID,
    lastReviewedOn: '2026-08-12',
    phases: [
      {
        description:
          'Prepare the public profile and consume relevant topics so the account has a coherent graph before original posting.',
        endDay: 2,
        id: 'profile-and-topic-consumption',
        startDay: 1,
        steps: [
          {
            completion: {
              description:
                'The user confirms display name, bio, avatar, and header are complete and on-brand.',
              key: 'profile-ready-confirmed',
              type: 'attestation',
            },
            description:
              'Complete the X profile (name, bio, avatar, header, location/link if used) before posting.',
            days: [1],
            evidenceIds: ['x-product-guidance'],
            id: 'complete-public-profile',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Complete public profile',
          },
          {
            completion: {
              description:
                'Authorized profile fields are readable when the connected app grants user read scopes.',
              key: 'profile-fields-platform-signal',
              type: 'signal',
            },
            description:
              'Refresh profile fields from the authorized connection when available; mark unavailable scopes explicitly.',
            days: [1, 2],
            evidenceIds: ['x-user-lookup', 'x-api-overview'],
            id: 'refresh-authorized-profile',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Refresh authorized profile',
          },
          {
            completion: {
              description:
                'The user confirms they manually browsed topic searches and relevant timelines without automation.',
              key: 'topic-consumption-confirmed',
              type: 'attestation',
            },
            description:
              'Search niche topics and spend real time in Home/Following/Lists. Timeline consumption outside Genfeed stays user-confirmed.',
            days: [1, 2],
            evidenceIds: ['x-product-guidance'],
            id: 'consume-topic-graph',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Consume topic graph manually',
          },
        ],
        title: 'Profile readiness and topic consumption',
      },
      {
        description:
          'Participate reply-first with genuine, contextual replies before original posts.',
        endDay: 4,
        id: 'reply-first-participation',
        startDay: 3,
        steps: [
          {
            completion: {
              description:
                'The user confirms replies were written manually and referred to the specific post.',
              key: 'contextual-replies-confirmed',
              type: 'attestation',
            },
            description:
              'Leave a small number of genuine replies on relevant posts. Do not automate likes, follows, bookmarks, or bulk replies.',
            days: [3, 4],
            evidenceIds: ['x-product-guidance'],
            id: 'reply-first-manual',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Reply first (manual)',
          },
          {
            completion: {
              description:
                'Genfeed has recorded any reply drafts or published replies created inside Genfeed.',
              key: 'genfeed-reply-drafts-observed',
              type: 'event',
            },
            description:
              'When using Genfeed for reply drafts or publish, outcomes stay genfeed_observed and distinct from native-app replies.',
            days: [3, 4],
            evidenceIds: ['x-product-guidance', 'x-manage-tweets'],
            id: 'observe-genfeed-replies',
            provenance: 'genfeed_observed',
            requirement: 'optional',
            title: 'Observe Genfeed reply activity',
          },
          {
            completion: {
              description:
                'The user confirms follows and likes were selective and manual when performed outside Genfeed.',
              key: 'selective-graph-actions-confirmed',
              type: 'attestation',
            },
            description:
              'Follows, likes, and bookmarks outside Genfeed remain user_confirmed; never farm engagement.',
            days: [3, 4],
            evidenceIds: ['x-product-guidance'],
            id: 'selective-graph-actions',
            provenance: 'user_confirmed',
            requirement: 'optional',
            title: 'Selective graph actions (manual)',
          },
        ],
        title: 'Reply-first participation',
      },
      {
        description:
          'Ship first originals or a short thread, then assess before increasing cadence.',
        endDay: 7,
        id: 'first-originals-and-cadence',
        startDay: 5,
        steps: [
          {
            completion: {
              description:
                'The user or Genfeed has a first original post ready or published.',
              key: 'first-original-draft-or-publish',
              type: 'event',
            },
            description:
              'Create a first original post or short thread with on-brand content. Prefer quality over volume.',
            days: [5, 6],
            evidenceIds: ['x-product-guidance', 'x-manage-tweets'],
            id: 'first-original-post',
            provenance: 'genfeed_observed',
            requirement: 'required_when_available',
            title: 'First original post or thread',
          },
          {
            completion: {
              description:
                'Authorized owned-post timeline data shows the first original when the tier allows.',
              key: 'first-original-platform-signal',
              type: 'signal',
            },
            description:
              'When the connection can read owned posts, verify the first original appeared; otherwise keep unavailable.',
            days: [5, 6, 7],
            evidenceIds: ['x-timelines', 'x-manage-tweets'],
            id: 'observe-first-original-platform',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Observe first original on X',
          },
          {
            completion: {
              description:
                'The user confirms they reviewed outcomes before raising daily post volume.',
              key: 'assessment-before-cadence-confirmed',
              type: 'attestation',
            },
            description:
              'Assess replies, failures, and quality before increasing cadence. Completing the plan does not guarantee distribution or account safety.',
            days: [7],
            evidenceIds: ['x-product-guidance'],
            id: 'assess-before-cadence',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Assess before gradual cadence',
          },
          {
            completion: {
              description:
                'Genfeed has recorded continued draft/publish outcomes after the first original.',
              key: 'continued-genfeed-publish-activity',
              type: 'event',
            },
            description:
              'Keep early cadence light; review Genfeed failures before adding volume.',
            days: [7],
            evidenceIds: ['x-product-guidance', 'x-manage-tweets'],
            id: 'observe-continued-publish',
            provenance: 'genfeed_observed',
            requirement: 'optional',
            title: 'Observe continued Genfeed publish activity',
          },
        ],
        title: 'First originals, assessment, gradual cadence',
      },
    ],
    platform: CredentialPlatform.TWITTER,
    summary:
      'A 5–7 day X progression from profile readiness and topic consumption, through reply-first participation, to first originals/threads and gradual cadence — without automated engagement farming.',
    title: 'X 5–7 day warm-up',
    version: TWITTER_SOCIAL_WARMUP_BLUEPRINT_VERSION,
  });

export const INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT_ID = 'social-warmup.instagram';
export const INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT_VERSION = 1;

/**
 * Instagram guided warm-up (#2218).
 * Profile readiness, consumption, thoughtful engagement, first Reel/carousel,
 * Stories, assessment, gradual cadence. No automated engagement farming.
 */
export const INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT =
  socialWarmupBlueprintSchema.parse({
    evidenceBasis: [
      {
        id: 'ig-product-guidance',
        kind: 'product_guidance',
        reference: 'skills/instagram-warmup/SKILL.md',
        reviewedOn: '2026-08-12',
        title: 'Genfeed Instagram warm-up long-form guidance',
      },
      {
        id: 'ig-graph-api',
        kind: 'platform_documentation',
        reference: 'https://developers.facebook.com/docs/instagram-api/',
        reviewedOn: '2026-08-12',
        title: 'Instagram Graph API overview',
      },
      {
        id: 'ig-user-profile',
        kind: 'platform_documentation',
        reference:
          'https://developers.facebook.com/docs/instagram-api/reference/ig-user',
        reviewedOn: '2026-08-12',
        title: 'IG User reference',
      },
      {
        id: 'ig-media',
        kind: 'platform_documentation',
        reference:
          'https://developers.facebook.com/docs/instagram-api/reference/ig-user/media',
        reviewedOn: '2026-08-12',
        title: 'IG User media',
      },
      {
        id: 'ig-content-publishing',
        kind: 'platform_documentation',
        reference:
          'https://developers.facebook.com/docs/instagram-api/guides/content-publishing',
        reviewedOn: '2026-08-12',
        title: 'Instagram content publishing',
      },
    ],
    graduation: {
      disclaimer:
        'Graduation means the configured steps have enough evidence to begin a gradual publishing cadence. It does not guarantee reach, distribution, or freedom from moderation.',
      minimumElapsedDays: 5,
      recommendedElapsedDays: 7,
      rules: [
        {
          completion: {
            description:
              'The user has confirmed required native-app consumption and thoughtful engagement.',
            key: 'manual-foundation-confirmed',
            type: 'attestation',
          },
          description:
            'Complete native-app foundation without representing private likes, follows, or DMs as API telemetry.',
          evidenceIds: ['ig-product-guidance'],
          id: 'manual-foundation-complete',
          provenance: 'user_confirmed',
          requirement: 'required',
          title: 'Native-app foundation confirmed',
        },
        {
          completion: {
            description:
              'Authorized profile and owned-media signals have been refreshed when the connection allows.',
            key: 'authorized-account-snapshot',
            type: 'signal',
          },
          description:
            'Use only fields granted by the Instagram Graph connection; missing permissions stay unavailable.',
          evidenceIds: ['ig-graph-api', 'ig-user-profile', 'ig-media'],
          id: 'authorized-signals-refreshed',
          provenance: 'platform_verified',
          requirement: 'required_when_available',
          title: 'Authorized signals refreshed',
        },
        {
          completion: {
            description:
              'Instagram exposes owned media or Genfeed has recorded a completed publish when available.',
            key: 'first-publish-observed',
            type: 'signal',
          },
          description:
            'Observe the first Reel, carousel, or feed post through authorized media or Genfeed publish status.',
          evidenceIds: ['ig-media', 'ig-content-publishing'],
          id: 'first-publish-platform-observed',
          provenance: 'platform_verified',
          requirement: 'required_when_available',
          title: 'First publish observed',
        },
        {
          completion: {
            description:
              'Genfeed has recorded draft, publish, or failure outcomes without replacing them with inferred platform behavior.',
            key: 'genfeed-publish-outcomes-observed',
            type: 'event',
          },
          description:
            'Review unresolved Genfeed failures before increasing cadence.',
          evidenceIds: ['ig-product-guidance', 'ig-content-publishing'],
          id: 'genfeed-outcomes-reviewed',
          provenance: 'genfeed_observed',
          requirement: 'required_when_available',
          title: 'Genfeed outcomes reviewed',
        },
      ],
    },
    id: INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT_ID,
    lastReviewedOn: '2026-08-12',
    phases: [
      {
        description:
          'Complete the public profile and consume niche Reels/feed content before publishing.',
        endDay: 2,
        id: 'profile-and-consumption',
        startDay: 1,
        steps: [
          {
            completion: {
              description:
                'The user confirms name, bio, avatar, and category are complete and on-brand.',
              key: 'profile-ready-confirmed',
              type: 'attestation',
            },
            description:
              'Finish Instagram profile basics before first original posts.',
            days: [1],
            evidenceIds: ['ig-product-guidance'],
            id: 'complete-public-profile',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Complete public profile',
          },
          {
            completion: {
              description:
                'Authorized profile fields are readable when Graph permissions allow.',
              key: 'profile-fields-platform-signal',
              type: 'signal',
            },
            description:
              'Refresh profile from the authorized connection when available.',
            days: [1, 2],
            evidenceIds: ['ig-user-profile', 'ig-graph-api'],
            id: 'refresh-authorized-profile',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Refresh authorized profile',
          },
          {
            completion: {
              description:
                'The user confirms manual Reels/Explore/feed consumption without automation.',
              key: 'niche-consumption-confirmed',
              type: 'attestation',
            },
            description:
              'Watch niche Reels and feed posts long enough to understand formats. Native consumption stays user_confirmed.',
            days: [1, 2],
            evidenceIds: ['ig-product-guidance'],
            id: 'consume-niche-content',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Consume niche content manually',
          },
        ],
        title: 'Profile readiness and consumption',
      },
      {
        description:
          'Engage thoughtfully with comments and saves before original publishing.',
        endDay: 4,
        id: 'thoughtful-engagement',
        startDay: 3,
        steps: [
          {
            completion: {
              description:
                'The user confirms comments were written manually and referred to the specific media.',
              key: 'contextual-comments-confirmed',
              type: 'attestation',
            },
            description:
              'Leave genuine, contextual comments. Do not automate likes, follows, saves, or DMs.',
            days: [3, 4],
            evidenceIds: ['ig-product-guidance'],
            id: 'comment-thoughtfully',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Comment thoughtfully (manual)',
          },
          {
            completion: {
              description:
                'The user confirms selective likes/saves/follows were manual when performed outside Genfeed.',
              key: 'selective-engagement-confirmed',
              type: 'attestation',
            },
            description:
              'Like and save relevant examples; follow a small set of peers. Outside-Genfeed actions stay user_confirmed.',
            days: [3, 4],
            evidenceIds: ['ig-product-guidance'],
            id: 'selective-engagement',
            provenance: 'user_confirmed',
            requirement: 'optional',
            title: 'Selective likes, saves, follows',
          },
          {
            completion: {
              description:
                'Genfeed has recorded any draft or publish activity created inside Genfeed.',
              key: 'genfeed-draft-activity-observed',
              type: 'event',
            },
            description:
              'When using Genfeed for drafts/remix, outcomes stay genfeed_observed.',
            days: [3, 4],
            evidenceIds: ['ig-product-guidance', 'ig-content-publishing'],
            id: 'observe-genfeed-drafts',
            provenance: 'genfeed_observed',
            requirement: 'optional',
            title: 'Observe Genfeed draft activity',
          },
        ],
        title: 'Thoughtful engagement',
      },
      {
        description:
          'Ship first Reel or carousel, optional Stories, assess, then gradual cadence.',
        endDay: 7,
        id: 'first-publish-and-cadence',
        startDay: 5,
        steps: [
          {
            completion: {
              description:
                'Genfeed has a first Reel/carousel draft or publish outcome.',
              key: 'first-reel-or-carousel',
              type: 'event',
            },
            description:
              'Publish a first Reel or carousel with on-brand creative. Prefer quality over volume.',
            days: [5, 6],
            evidenceIds: ['ig-product-guidance', 'ig-content-publishing'],
            id: 'first-reel-or-carousel',
            provenance: 'genfeed_observed',
            requirement: 'required_when_available',
            title: 'First Reel or carousel',
          },
          {
            completion: {
              description:
                'Authorized owned-media data shows the first publish when permissions allow.',
              key: 'first-publish-platform-signal',
              type: 'signal',
            },
            description:
              'When media listing is available, verify the first post appeared.',
            days: [5, 6, 7],
            evidenceIds: ['ig-media', 'ig-content-publishing'],
            id: 'observe-first-publish-platform',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Observe first publish on Instagram',
          },
          {
            completion: {
              description:
                'The user confirms they posted or reviewed Stories as part of the plan when relevant.',
              key: 'stories-participation-confirmed',
              type: 'attestation',
            },
            description:
              'Optional Stories practice; keep Stories native-app when not supported by publish path.',
            days: [6, 7],
            evidenceIds: ['ig-product-guidance'],
            id: 'optional-stories',
            provenance: 'user_confirmed',
            requirement: 'optional',
            title: 'Optional Stories practice',
          },
          {
            completion: {
              description:
                'The user confirms they assessed outcomes before raising post volume.',
              key: 'assessment-before-cadence-confirmed',
              type: 'attestation',
            },
            description:
              'Assess quality and failures before increasing cadence. Completing the plan does not guarantee distribution.',
            days: [7],
            evidenceIds: ['ig-product-guidance'],
            id: 'assess-before-cadence',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Assess before gradual cadence',
          },
        ],
        title: 'First publish, Stories, gradual cadence',
      },
    ],
    platform: CredentialPlatform.INSTAGRAM,
    summary:
      'A 5–7 day Instagram progression from profile readiness and consumption, through thoughtful engagement, to first Reel/carousel, optional Stories, and gradual cadence.',
    title: 'Instagram 5–7 day warm-up',
    version: INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT_VERSION,
  });

export const YOUTUBE_SOCIAL_WARMUP_BLUEPRINT_ID = 'social-warmup.youtube';
export const YOUTUBE_SOCIAL_WARMUP_BLUEPRINT_VERSION = 1;

/**
 * YouTube guided warm-up (#2220).
 * Channel setup, niche/search research, native viewing/engagement, first
 * Shorts, owned-video analytics, and a Shorts-to-long-form transition.
 * No automated watch time, subscriptions, likes, or comments.
 */
export const YOUTUBE_SOCIAL_WARMUP_BLUEPRINT =
  socialWarmupBlueprintSchema.parse({
    evidenceBasis: [
      {
        id: 'yt-product-guidance',
        kind: 'product_guidance',
        reference: 'skills/youtube-warmup/SKILL.md',
        reviewedOn: '2026-08-24',
        title: 'Genfeed YouTube warm-up long-form guidance',
      },
      {
        id: 'yt-data-api',
        kind: 'platform_documentation',
        reference: 'https://developers.google.com/youtube/v3/docs',
        reviewedOn: '2026-08-24',
        title: 'YouTube Data API overview',
      },
      {
        id: 'yt-channels',
        kind: 'platform_documentation',
        reference:
          'https://developers.google.com/youtube/v3/docs/channels/list',
        reviewedOn: '2026-08-24',
        title: 'YouTube Channels list',
      },
      {
        id: 'yt-playlist-items',
        kind: 'platform_documentation',
        reference:
          'https://developers.google.com/youtube/v3/docs/playlistItems/list',
        reviewedOn: '2026-08-24',
        title: 'YouTube PlaylistItems list',
      },
      {
        id: 'yt-videos',
        kind: 'platform_documentation',
        reference: 'https://developers.google.com/youtube/v3/docs/videos/list',
        reviewedOn: '2026-08-24',
        title: 'YouTube Videos list',
      },
      {
        id: 'yt-analytics',
        kind: 'platform_documentation',
        reference: 'https://developers.google.com/youtube/analytics',
        reviewedOn: '2026-08-24',
        title: 'YouTube Analytics API',
      },
      {
        id: 'yt-upload',
        kind: 'platform_documentation',
        reference:
          'https://developers.google.com/youtube/v3/guides/uploading_a_video',
        reviewedOn: '2026-08-24',
        title: 'YouTube video upload',
      },
    ],
    graduation: {
      disclaimer:
        'Graduation means the configured channel and video checks have enough evidence to begin a gradual Shorts-to-long-form cadence. It does not promise recommendation-system outcomes, search ranking, or freedom from moderation.',
      minimumElapsedDays: 10,
      recommendedElapsedDays: 14,
      rules: [
        {
          completion: {
            description:
              'The user has confirmed required native viewing, search, and channel-setup actions.',
            key: 'manual-foundation-confirmed',
            type: 'attestation',
          },
          description:
            'Complete native YouTube foundation without representing private watch history, subscriptions, likes, comments, search, or homepage ranking as API telemetry.',
          evidenceIds: ['yt-product-guidance'],
          id: 'manual-foundation-complete',
          provenance: 'user_confirmed',
          requirement: 'required',
          title: 'Native viewing and channel foundation confirmed',
        },
        {
          completion: {
            description:
              'Authorized channel metadata and owned-upload signals have been refreshed when the connection allows.',
            key: 'authorized-channel-snapshot',
            type: 'signal',
          },
          description:
            'Use only fields granted by the YouTube connection; missing analytics or unpublished channel selection stay unavailable.',
          evidenceIds: ['yt-data-api', 'yt-channels', 'yt-videos'],
          id: 'authorized-signals-refreshed',
          provenance: 'platform_verified',
          requirement: 'required_when_available',
          title: 'Authorized channel signals refreshed',
        },
        {
          completion: {
            description:
              'YouTube exposes an owned upload or Genfeed has recorded a completed Shorts publish when available.',
            key: 'first-upload-platform-signal',
            type: 'signal',
          },
          description:
            'Observe the first Short through authorized uploads or Genfeed publish status.',
          evidenceIds: ['yt-videos', 'yt-upload'],
          id: 'first-shorts-platform-observed',
          provenance: 'platform_verified',
          requirement: 'required_when_available',
          title: 'First Short observed',
        },
        {
          completion: {
            description:
              'Owned-video analytics were refreshed when yt-analytics.readonly is granted.',
            key: 'owned-video-analytics-snapshot',
            type: 'signal',
          },
          description:
            'Missing analytics permissions stay permission-limited. Do not invent CTR, average view duration, or traffic-source values.',
          evidenceIds: ['yt-analytics'],
          id: 'analytics-refreshed',
          provenance: 'platform_verified',
          requirement: 'required_when_available',
          title: 'Owned-video analytics refreshed',
        },
        {
          completion: {
            description:
              'Genfeed has recorded upload, publish, failure, cadence, and clip-lineage outcomes without replacing them with inferred platform behavior.',
            key: 'genfeed-publish-outcomes-observed',
            type: 'event',
          },
          description:
            'Review unresolved Genfeed failures and clip lineage before increasing cadence.',
          evidenceIds: ['yt-product-guidance', 'yt-upload'],
          id: 'genfeed-outcomes-reviewed',
          provenance: 'genfeed_observed',
          requirement: 'required_when_available',
          title: 'Genfeed outcomes reviewed',
        },
        {
          completion: {
            description:
              'The user confirmed a Shorts-first or Shorts-plus-long-form path without treating it as a recommendation guarantee.',
            key: 'shorts-to-longform-path-confirmed',
            type: 'attestation',
          },
          description:
            'Choose a gradual Shorts-to-long-form transition from configurable channel/video evidence and user confirmation.',
          evidenceIds: ['yt-product-guidance'],
          id: 'shorts-to-longform-path-confirmed',
          provenance: 'user_confirmed',
          requirement: 'required',
          title: 'Shorts-to-long-form path confirmed',
        },
      ],
    },
    id: YOUTUBE_SOCIAL_WARMUP_BLUEPRINT_ID,
    lastReviewedOn: '2026-08-24',
    phases: [
      {
        description:
          'Research the niche through YouTube search and watch native recommendations before uploading.',
        endDay: 3,
        id: 'search-and-native-viewing',
        startDay: 1,
        steps: [
          {
            completion: {
              description:
                'The user confirms niche keyword searches were performed in YouTube.',
              key: 'niche-search-confirmed',
              type: 'attestation',
            },
            description:
              'Search niche keywords and watch top organic results. Search activity stays user_confirmed.',
            days: [1, 2, 3],
            evidenceIds: ['yt-product-guidance'],
            id: 'search-niche-keywords',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Search niche keywords manually',
          },
          {
            completion: {
              description:
                'The user confirms they watched niche videos to completion without automation.',
              key: 'native-viewing-confirmed',
              type: 'attestation',
            },
            description:
              'Watch niche videos in the native YouTube app. Watch history is not API-visible and stays user_confirmed.',
            days: [1, 2, 3],
            evidenceIds: ['yt-product-guidance'],
            id: 'watch-niche-videos',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Watch niche videos to completion',
          },
          {
            completion: {
              description:
                'The user confirms they subscribed to relevant channels and watched from the subscription feed.',
              key: 'subscriptions-confirmed',
              type: 'attestation',
            },
            description:
              'Subscribe to a small set of active niche channels and watch from the subscription feed. Subscriptions stay user_confirmed.',
            days: [1, 2, 3],
            evidenceIds: ['yt-product-guidance'],
            id: 'subscribe-and-watch-subscriptions',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Subscribe and watch from subscriptions',
          },
          {
            completion: {
              description:
                'The user confirms likes and comments made outside Genfeed were manual.',
              key: 'likes-and-comments-confirmed',
              type: 'attestation',
            },
            description:
              'Like and comment selectively in the native app. Likes and comments made outside Genfeed stay user_confirmed.',
            days: [1, 2, 3],
            evidenceIds: ['yt-product-guidance'],
            id: 'like-and-comment-selectively',
            provenance: 'user_confirmed',
            requirement: 'optional',
            title: 'Like and comment selectively (manual)',
          },
          {
            completion: {
              description:
                'The user confirms the Home feed is becoming more niche-relevant.',
              key: 'homepage-tuning-confirmed',
              type: 'attestation',
            },
            description:
              'Check whether Home recommendations match the niche. Homepage ranking stays user_confirmed.',
            days: [2, 3],
            evidenceIds: ['yt-product-guidance'],
            id: 'check-homepage-relevance',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Check Home feed relevance',
          },
        ],
        title: 'Niche search and native viewing',
      },
      {
        description:
          'Complete public channel identity and refresh authorized channel metadata before the first Short.',
        endDay: 7,
        id: 'channel-setup',
        startDay: 4,
        steps: [
          {
            completion: {
              description:
                'The user confirms handle, avatar, banner, About copy, and playlists are complete.',
              key: 'channel-setup-confirmed',
              type: 'attestation',
            },
            description:
              'Finish YouTube channel setup in Studio before the first upload. Native Studio edits stay user_confirmed.',
            days: [4, 5],
            evidenceIds: ['yt-product-guidance'],
            id: 'complete-channel-setup',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Complete channel setup',
          },
          {
            completion: {
              description:
                'Authorized channel metadata is readable when YouTube scopes allow.',
              key: 'channel-fields-platform-signal',
              type: 'signal',
            },
            description:
              'Refresh channel identity from the authorized connection. Missing channel selection stays recoverable.',
            days: [4, 5, 6, 7],
            evidenceIds: ['yt-channels', 'yt-data-api'],
            id: 'refresh-authorized-channel',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Refresh authorized channel',
          },
          {
            completion: {
              description:
                'Authorized upload capability is readable when publish scopes allow.',
              key: 'publishing-capability-snapshot',
              type: 'signal',
            },
            description:
              'Confirm the connected channel can upload when youtube.upload or youtube is granted.',
            days: [5, 6, 7],
            evidenceIds: ['yt-upload', 'yt-channels'],
            id: 'snapshot-publishing-capability',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Snapshot publishing capability',
          },
          {
            completion: {
              description:
                'Genfeed has recorded any draft or clip activity created inside Genfeed.',
              key: 'genfeed-draft-activity-observed',
              type: 'event',
            },
            description:
              'When using Genfeed for Shorts drafts or clip lineage, outcomes stay genfeed_observed.',
            days: [6, 7],
            evidenceIds: ['yt-product-guidance', 'yt-upload'],
            id: 'observe-genfeed-drafts',
            provenance: 'genfeed_observed',
            requirement: 'optional',
            title: 'Observe Genfeed draft activity',
          },
        ],
        title: 'Channel setup',
      },
      {
        description:
          'Publish a first original Short and observe owned uploads without automating watch time.',
        endDay: 10,
        id: 'first-shorts',
        startDay: 8,
        steps: [
          {
            completion: {
              description:
                'Genfeed has a first Shorts draft or publish outcome.',
              key: 'first-shorts-upload',
              type: 'event',
            },
            description:
              'Upload one original Short with search-intent metadata. Prefer quality over volume.',
            days: [8, 9],
            evidenceIds: ['yt-product-guidance', 'yt-upload'],
            id: 'first-shorts-upload',
            provenance: 'genfeed_observed',
            requirement: 'required_when_available',
            title: 'First Shorts upload',
          },
          {
            completion: {
              description:
                'Authorized owned uploads show the first video when permissions allow.',
              key: 'first-upload-platform-signal',
              type: 'signal',
            },
            description:
              'When upload listing is available, verify the first Short appeared. Empty channels stay empty, not failed.',
            days: [8, 9, 10],
            evidenceIds: ['yt-playlist-items', 'yt-videos', 'yt-upload'],
            id: 'observe-first-upload-platform',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Observe first upload on YouTube',
          },
          {
            completion: {
              description:
                'Authorized owned-upload inventory was refreshed when scopes allow.',
              key: 'owned-uploads-snapshot',
              type: 'signal',
            },
            description:
              'Snapshot owned uploads from the uploads playlist. Do not invent videos the API did not return.',
            days: [9, 10],
            evidenceIds: ['yt-playlist-items', 'yt-videos'],
            id: 'snapshot-owned-uploads',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Snapshot owned uploads',
          },
        ],
        title: 'First Shorts',
      },
      {
        description:
          'Review owned-video analytics and choose a gradual Shorts-to-long-form cadence.',
        endDay: 14,
        id: 'performance-and-longform',
        startDay: 11,
        steps: [
          {
            completion: {
              description:
                'Owned-video analytics were refreshed when analytics scope allows.',
              key: 'owned-video-analytics-snapshot',
              type: 'signal',
            },
            description:
              'Refresh CTR, average view duration, and related owned-video analytics when yt-analytics.readonly is granted. Missing analytics stay permission-limited.',
            days: [11, 12, 13],
            evidenceIds: ['yt-analytics'],
            id: 'snapshot-owned-video-analytics',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Snapshot owned-video analytics',
          },
          {
            completion: {
              description:
                'The user confirmed they reviewed outcomes before raising volume or adding long-form.',
              key: 'performance-review-confirmed',
              type: 'attestation',
            },
            description:
              'Assess owned-video evidence and Genfeed failures before increasing cadence. Completing the plan does not guarantee recommendations.',
            days: [12, 13],
            evidenceIds: ['yt-product-guidance'],
            id: 'assess-before-longform',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Assess before long-form',
          },
          {
            completion: {
              description:
                'The user confirmed a Shorts-first continuation or a gradual long-form introduction.',
              key: 'shorts-to-longform-path-confirmed',
              type: 'attestation',
            },
            description:
              'Choose Shorts-first or Shorts plus one long-form video. Do not jump to a high long-form cadence.',
            days: [13, 14],
            evidenceIds: ['yt-product-guidance'],
            id: 'confirm-shorts-to-longform-path',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Confirm Shorts-to-long-form path',
          },
          {
            completion: {
              description:
                'Genfeed has recorded cadence, failures, and clip lineage for YouTube publishes.',
              key: 'genfeed-publish-outcomes-observed',
              type: 'event',
            },
            description:
              'Review Genfeed upload, failure, cadence, and clip-lineage records before scaling.',
            days: [14],
            evidenceIds: ['yt-product-guidance', 'yt-upload'],
            id: 'observe-genfeed-cadence',
            provenance: 'genfeed_observed',
            requirement: 'required_when_available',
            title: 'Observe Genfeed cadence and clip lineage',
          },
        ],
        title: 'Performance review and gradual long-form',
      },
    ],
    platform: CredentialPlatform.YOUTUBE,
    summary:
      'A 10–14 day YouTube progression from channel setup and search-first native viewing, through first Shorts and owned-video analytics, to a gradual Shorts-to-long-form cadence — without automated watch time or engagement farming.',
    title: 'YouTube 10–14 day channel warm-up',
    version: YOUTUBE_SOCIAL_WARMUP_BLUEPRINT_VERSION,
  });

export const LINKEDIN_SOCIAL_WARMUP_BLUEPRINT_ID = 'social-warmup.linkedin';
export const LINKEDIN_SOCIAL_WARMUP_BLUEPRINT_VERSION = 1;

/**
 * LinkedIn guided warm-up (#2221).
 * Profile completeness, niche feed consumption, comment-first
 * participation, first value-led posts, assessment, and cadence growth.
 * No automated connection requests, reactions, comments, messages, or SSI.
 */
export const LINKEDIN_SOCIAL_WARMUP_BLUEPRINT =
  socialWarmupBlueprintSchema.parse({
    evidenceBasis: [
      {
        id: 'li-product-guidance',
        kind: 'product_guidance',
        reference: 'skills/linkedin-warmup/SKILL.md',
        reviewedOn: '2026-08-24',
        title: 'Genfeed LinkedIn warm-up long-form guidance',
      },
      {
        id: 'li-oauth',
        kind: 'platform_documentation',
        reference:
          'https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication',
        reviewedOn: '2026-08-24',
        title: 'LinkedIn OAuth 2.0 authorization',
      },
      {
        id: 'li-member-profile',
        kind: 'platform_documentation',
        reference:
          'https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2',
        reviewedOn: '2026-08-24',
        title: 'Sign In with LinkedIn using OpenID Connect',
      },
      {
        id: 'li-ugc-posts',
        kind: 'platform_documentation',
        reference:
          'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/ugc-post-api',
        reviewedOn: '2026-08-24',
        title: 'LinkedIn UGC Post API',
      },
      {
        id: 'li-social-actions',
        kind: 'platform_documentation',
        reference:
          'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/network-update-social-actions',
        reviewedOn: '2026-08-24',
        title: 'LinkedIn social actions',
      },
      {
        id: 'li-organization-acls',
        kind: 'platform_documentation',
        reference:
          'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control',
        reviewedOn: '2026-08-24',
        title: 'LinkedIn organization access control',
      },
      {
        id: 'li-member-share',
        kind: 'platform_documentation',
        reference:
          'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/ugc-post-api#create-ugc-posts',
        reviewedOn: '2026-08-24',
        title: 'Create LinkedIn member UGC posts',
      },
    ],
    graduation: {
      disclaimer:
        'Graduation means the configured LinkedIn profile, participation, and first-post checks have enough evidence to begin a gradual posting cadence. It does not promise SSI growth, feed reach, or freedom from restriction or moderation.',
      minimumElapsedDays: 10,
      recommendedElapsedDays: 14,
      rules: [
        {
          completion: {
            description:
              'The user has confirmed required native profile, feed, connection, and comment actions.',
            key: 'manual-foundation-confirmed',
            type: 'attestation',
          },
          description:
            'Complete native LinkedIn foundation without representing feed consumption, connection requests, comments, reactions, saves, messages, or SSI as API telemetry.',
          evidenceIds: ['li-product-guidance'],
          id: 'manual-foundation-complete',
          provenance: 'user_confirmed',
          requirement: 'required',
          title: 'Native profile and participation confirmed',
        },
        {
          completion: {
            description:
              'Authorized member profile signals have been refreshed when the connection allows.',
            key: 'member-profile-fields-platform-signal',
            type: 'signal',
          },
          description:
            'Use only fields granted by the LinkedIn member connection. Missing organization scopes stay unavailable on a separate claim.',
          evidenceIds: ['li-member-profile', 'li-oauth'],
          id: 'authorized-member-signals-refreshed',
          provenance: 'platform_verified',
          requirement: 'required_when_available',
          title: 'Authorized member profile refreshed',
        },
        {
          completion: {
            description:
              'Organization-page identity and publishing were snapshotted separately from the member profile.',
            key: 'organization-page-snapshot',
            type: 'signal',
          },
          description:
            'Personal-profile and organization-page capabilities stay distinct. Missing organization permissions stay permission-limited, not ready.',
          evidenceIds: ['li-organization-acls', 'li-oauth'],
          id: 'member-vs-organization-distinguished',
          provenance: 'platform_verified',
          requirement: 'required_when_available',
          title: 'Member and organization capabilities distinguished',
        },
        {
          completion: {
            description:
              'LinkedIn exposes an owned post or Genfeed has recorded a completed publish when available.',
            key: 'first-publish-platform-signal',
            type: 'signal',
          },
          description:
            'Observe the first value-led post through authorized owned posts or Genfeed publish status.',
          evidenceIds: ['li-ugc-posts', 'li-member-share'],
          id: 'first-post-platform-observed',
          provenance: 'platform_verified',
          requirement: 'required_when_available',
          title: 'First value-led post observed',
        },
        {
          completion: {
            description:
              'Genfeed has recorded create, schedule, publish, failure, and cadence outcomes without replacing them with inferred platform behavior.',
            key: 'genfeed-publish-outcomes-observed',
            type: 'event',
          },
          description:
            'Review unresolved Genfeed failures before increasing cadence.',
          evidenceIds: ['li-product-guidance', 'li-member-share'],
          id: 'genfeed-outcomes-reviewed',
          provenance: 'genfeed_observed',
          requirement: 'required_when_available',
          title: 'Genfeed outcomes reviewed',
        },
        {
          completion: {
            description:
              'The user confirmed SSI and cadence observations without treating them as a distribution guarantee.',
            key: 'ssi-and-cadence-confirmed',
            type: 'attestation',
          },
          description:
            'SSI remains a native observation. Completing warm-up does not guarantee SSI, reach, or restriction avoidance.',
          evidenceIds: ['li-product-guidance'],
          id: 'ssi-and-cadence-confirmed',
          provenance: 'user_confirmed',
          requirement: 'required',
          title: 'SSI observation and gradual cadence confirmed',
        },
      ],
    },
    id: LINKEDIN_SOCIAL_WARMUP_BLUEPRINT_ID,
    lastReviewedOn: '2026-08-24',
    phases: [
      {
        description:
          'Complete the native LinkedIn profile and refresh authorized member versus organization identity before posting.',
        endDay: 2,
        id: 'profile-completeness',
        startDay: 1,
        steps: [
          {
            completion: {
              description:
                'The user confirms headshot, headline, About, experience, education, skills, and custom URL are complete.',
              key: 'native-profile-confirmed',
              type: 'attestation',
            },
            description:
              'Finish profile completeness in the native LinkedIn app. Native profile edits stay user_confirmed.',
            days: [1, 2],
            evidenceIds: ['li-product-guidance'],
            id: 'complete-native-profile',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Complete native LinkedIn profile',
          },
          {
            completion: {
              description:
                'Authorized member profile fields are readable when OpenID/profile scopes allow.',
              key: 'member-profile-fields-platform-signal',
              type: 'signal',
            },
            description:
              'Refresh member identity from the authorized connection. Do not treat this as organization-page readiness.',
            days: [1, 2],
            evidenceIds: ['li-member-profile', 'li-oauth'],
            id: 'refresh-authorized-member-profile',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Refresh authorized member profile',
          },
          {
            completion: {
              description:
                'Authorized organization-page identity is readable when organization scopes allow.',
              key: 'organization-page-snapshot',
              type: 'signal',
            },
            description:
              'Snapshot the connected organization page separately from the member profile. Missing organization permissions stay permission-limited.',
            days: [1, 2],
            evidenceIds: ['li-organization-acls', 'li-oauth'],
            id: 'snapshot-organization-page',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Snapshot organization page separately',
          },
        ],
        title: 'Profile completeness',
      },
      {
        description:
          'Read the niche feed, search, save, and react in the native app before original posts.',
        endDay: 4,
        id: 'niche-feed-consumption',
        startDay: 3,
        steps: [
          {
            completion: {
              description:
                'The user confirms they read the LinkedIn home feed for niche-relevant posts without automation.',
              key: 'niche-feed-confirmed',
              type: 'attestation',
            },
            description:
              'Read the native LinkedIn home feed. Feed ranking and consumption stay user_confirmed.',
            days: [3, 4],
            evidenceIds: ['li-product-guidance'],
            id: 'read-niche-feed',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Read the niche feed manually',
          },
          {
            completion: {
              description:
                'The user confirms niche keyword searches were performed in LinkedIn.',
              key: 'niche-search-confirmed',
              type: 'attestation',
            },
            description:
              'Search niche keywords and read top posts. Search activity stays user_confirmed.',
            days: [3, 4],
            evidenceIds: ['li-product-guidance'],
            id: 'search-niche-keywords',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Search niche keywords manually',
          },
          {
            completion: {
              description:
                'The user confirms saves and mixed reactions were made in the native app.',
              key: 'saves-and-reactions-confirmed',
              type: 'attestation',
            },
            description:
              'Save and react selectively. Saves and reactions stay user_confirmed.',
            days: [3, 4],
            evidenceIds: ['li-product-guidance'],
            id: 'save-and-react-selectively',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Save and react selectively (manual)',
          },
          {
            completion: {
              description:
                'The user confirms they followed niche people rather than brand pages.',
              key: 'niche-follows-confirmed',
              type: 'attestation',
            },
            description:
              'Follow active people in the niche. Follows stay user_confirmed.',
            days: [4],
            evidenceIds: ['li-product-guidance'],
            id: 'follow-niche-people',
            provenance: 'user_confirmed',
            requirement: 'optional',
            title: 'Follow niche people (manual)',
          },
        ],
        title: 'Niche feed consumption',
      },
      {
        description:
          'Join conversations with thoughtful comments and personalized connection requests. No automated outreach.',
        endDay: 7,
        id: 'thoughtful-participation',
        startDay: 5,
        steps: [
          {
            completion: {
              description:
                'The user confirms personalized connection requests were sent under a natural daily cap.',
              key: 'connection-requests-confirmed',
              type: 'attestation',
            },
            description:
              'Send personalized connection notes. Connection requests stay user_confirmed and are never automated.',
            days: [5, 6, 7],
            evidenceIds: ['li-product-guidance'],
            id: 'send-personalized-connection-requests',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Send personalized connection requests',
          },
          {
            completion: {
              description:
                'The user confirms substantive comments were written in the native app.',
              key: 'thoughtful-comments-confirmed',
              type: 'attestation',
            },
            description:
              'Leave thoughtful comments on niche posts. Comments stay user_confirmed.',
            days: [5, 6, 7],
            evidenceIds: ['li-product-guidance'],
            id: 'leave-thoughtful-comments',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Leave thoughtful comments (manual)',
          },
          {
            completion: {
              description:
                'The user confirms welcome messages to accepted connections were sent without pitching.',
              key: 'welcome-messages-confirmed',
              type: 'attestation',
            },
            description:
              'Send brief welcome messages, not pitches. Messages stay user_confirmed.',
            days: [6, 7],
            evidenceIds: ['li-product-guidance'],
            id: 'welcome-new-connections',
            provenance: 'user_confirmed',
            requirement: 'optional',
            title: 'Welcome new connections (manual)',
          },
          {
            completion: {
              description:
                'Authorized member publishing capability is readable when w_member_social is granted.',
              key: 'member-publishing-capability-snapshot',
              type: 'signal',
            },
            description:
              'Confirm the connected member can publish. Do not treat this as organization-page publishing readiness.',
            days: [6, 7],
            evidenceIds: ['li-member-share', 'li-oauth'],
            id: 'snapshot-member-publishing-capability',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Snapshot member publishing capability',
          },
        ],
        title: 'Thoughtful participation',
      },
      {
        description:
          'Publish first value-led text posts and observe owned posts without promotional CTAs.',
        endDay: 10,
        id: 'first-value-led-posts',
        startDay: 8,
        steps: [
          {
            completion: {
              description:
                'Genfeed has a first LinkedIn draft, schedule, or publish outcome.',
              key: 'first-value-led-post',
              type: 'event',
            },
            description:
              'Create one value-led text post. Prefer quality over volume; no promotional CTAs.',
            days: [8, 9],
            evidenceIds: ['li-product-guidance', 'li-member-share'],
            id: 'first-value-led-post',
            provenance: 'genfeed_observed',
            requirement: 'required_when_available',
            title: 'First value-led post',
          },
          {
            completion: {
              description:
                'Authorized owned posts show the first share when permissions allow.',
              key: 'first-publish-platform-signal',
              type: 'signal',
            },
            description:
              'When owned-post listing is available, verify the first post appeared. Empty profiles stay empty, not failed.',
            days: [8, 9, 10],
            evidenceIds: ['li-ugc-posts', 'li-member-share'],
            id: 'observe-first-publish-platform',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Observe first post on LinkedIn',
          },
          {
            completion: {
              description:
                'Authorized owned-post inventory was refreshed when scopes allow.',
              key: 'owned-posts-snapshot',
              type: 'signal',
            },
            description:
              'Snapshot owned posts from the authorized connection. Do not invent posts the API did not return.',
            days: [9, 10],
            evidenceIds: ['li-ugc-posts'],
            id: 'snapshot-owned-posts',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Snapshot owned posts',
          },
          {
            completion: {
              description:
                'The user confirms first posts were text-first without body links or more than five hashtags.',
              key: 'text-first-posts-confirmed',
              type: 'attestation',
            },
            description:
              'Keep warmup posts text-first. External links belong in the first comment, never the post body.',
            days: [8, 9, 10],
            evidenceIds: ['li-product-guidance'],
            id: 'confirm-text-first-no-links',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Confirm text-first posts',
          },
        ],
        title: 'First value-led posts',
      },
      {
        description:
          'Review owned-post performance and native SSI without treating either as a guarantee.',
        endDay: 12,
        id: 'assessment',
        startDay: 11,
        steps: [
          {
            completion: {
              description:
                'Owned-post performance was refreshed when listing and social-action scopes allow.',
              key: 'owned-post-performance-snapshot',
              type: 'signal',
            },
            description:
              'Refresh impressions and engagement on owned posts when available. Missing permissions stay permission-limited.',
            days: [11, 12],
            evidenceIds: ['li-social-actions', 'li-ugc-posts'],
            id: 'snapshot-owned-post-performance',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Snapshot owned-post performance',
          },
          {
            completion: {
              description:
                'The user confirms they observed SSI in the native LinkedIn product.',
              key: 'ssi-observation-confirmed',
              type: 'attestation',
            },
            description:
              'SSI is not API-visible on this connection. Record it as user_confirmed and do not treat it as platform_verified.',
            days: [11, 12],
            evidenceIds: ['li-product-guidance'],
            id: 'confirm-ssi-observation',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Confirm SSI observation (manual)',
          },
          {
            completion: {
              description:
                'The user confirmed they reviewed outcomes before promotional content.',
              key: 'performance-review-confirmed',
              type: 'attestation',
            },
            description:
              'Assess owned-post evidence and Genfeed failures before promotional posts. Completing the plan does not guarantee SSI, reach, or restriction avoidance.',
            days: [12],
            evidenceIds: ['li-product-guidance'],
            id: 'assess-before-promotional',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Assess before promotional content',
          },
        ],
        title: 'Assessment',
      },
      {
        description:
          'Choose a gradual posting cadence and keep organization publishing as a separate claim.',
        endDay: 14,
        id: 'cadence-growth',
        startDay: 13,
        steps: [
          {
            completion: {
              description:
                'The user confirmed a gradual posting cadence rather than a sudden volume jump.',
              key: 'gradual-cadence-confirmed',
              type: 'attestation',
            },
            description:
              'Increase posts gradually after warmup. Sudden spikes can trigger review.',
            days: [13, 14],
            evidenceIds: ['li-product-guidance'],
            id: 'confirm-gradual-cadence',
            provenance: 'user_confirmed',
            requirement: 'required',
            title: 'Confirm gradual cadence growth',
          },
          {
            completion: {
              description:
                'Genfeed has recorded cadence, schedules, publishes, and failures for LinkedIn.',
              key: 'genfeed-publish-outcomes-observed',
              type: 'event',
            },
            description:
              'Review Genfeed create, schedule, publish, failure, and cadence records before scaling.',
            days: [14],
            evidenceIds: ['li-product-guidance', 'li-member-share'],
            id: 'observe-genfeed-cadence',
            provenance: 'genfeed_observed',
            requirement: 'required_when_available',
            title: 'Observe Genfeed cadence',
          },
          {
            completion: {
              description:
                'Authorized organization-page publishing is readable when organization scopes allow.',
              key: 'organization-publishing-capability-snapshot',
              type: 'signal',
            },
            description:
              'Confirm organization-page publishing separately from member w_member_social. Missing organization scopes stay permission-limited.',
            days: [13, 14],
            evidenceIds: [
              'li-organization-acls',
              'li-member-share',
              'li-oauth',
            ],
            id: 'snapshot-organization-publishing-capability',
            provenance: 'platform_verified',
            requirement: 'required_when_available',
            title: 'Snapshot organization publishing capability',
          },
        ],
        title: 'Cadence growth',
      },
    ],
    platform: CredentialPlatform.LINKEDIN,
    summary:
      'A 10–14 day LinkedIn progression from profile completeness and niche feed consumption, through thoughtful comments and first value-led posts, to assessment and gradual cadence — without automated connections, engagement, or SSI claims.',
    title: 'LinkedIn 10–14 day profile and network warm-up',
    version: LINKEDIN_SOCIAL_WARMUP_BLUEPRINT_VERSION,
  });

export const SOCIAL_WARMUP_BLUEPRINT_CATALOG: readonly SocialWarmupBlueprint[] =
  Object.freeze([
    TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
    TWITTER_SOCIAL_WARMUP_BLUEPRINT,
    INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT,
    YOUTUBE_SOCIAL_WARMUP_BLUEPRINT,
    LINKEDIN_SOCIAL_WARMUP_BLUEPRINT,
  ]);

export function findSocialWarmupBlueprint(
  blueprints: readonly SocialWarmupBlueprint[],
  reference: SocialWarmupBlueprintReference,
): SocialWarmupBlueprint | undefined {
  return blueprints.find(
    (blueprint) =>
      blueprint.id === reference.id && blueprint.version === reference.version,
  );
}

export function selectCurrentSocialWarmupBlueprint(
  blueprints: readonly SocialWarmupBlueprint[],
  platform: CredentialPlatform,
): SocialWarmupBlueprint | undefined {
  return blueprints
    .filter((blueprint) => blueprint.platform === platform)
    .reduce<SocialWarmupBlueprint | undefined>(
      (current, blueprint) =>
        current === undefined || blueprint.version > current.version
          ? blueprint
          : current,
      undefined,
    );
}

export function resolveSocialWarmupBlueprint(
  reference: SocialWarmupBlueprintReference,
): SocialWarmupBlueprint {
  const blueprint = findSocialWarmupBlueprint(
    SOCIAL_WARMUP_BLUEPRINT_CATALOG,
    socialWarmupBlueprintReferenceSchema.parse(reference),
  );

  if (!blueprint) {
    throw new Error(
      `Unknown social warm-up blueprint ${reference.id}@${reference.version}.`,
    );
  }

  return blueprint;
}

export function getCurrentSocialWarmupBlueprint(
  platform: CredentialPlatform,
): SocialWarmupBlueprint | undefined {
  return selectCurrentSocialWarmupBlueprint(
    SOCIAL_WARMUP_BLUEPRINT_CATALOG,
    platform,
  );
}
