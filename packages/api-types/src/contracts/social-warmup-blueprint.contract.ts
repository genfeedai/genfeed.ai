/**
 * Canonical social account warm-up blueprint contract.
 *
 * Definitions are versioned content. Enrollments persist `id` + `version` and
 * resolve that exact pair so publishing a new revision never changes an active
 * or historical enrollment. Platform adapters and enrollment persistence are
 * intentionally outside this contract (guided warm-up epic #2212, issue #2213).
 */

import { CredentialPlatform } from '@genfeedai/enums';
import { z } from 'zod';

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

export const SOCIAL_WARMUP_BLUEPRINT_CATALOG: readonly SocialWarmupBlueprint[] =
  Object.freeze([TIKTOK_SOCIAL_WARMUP_BLUEPRINT]);

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
