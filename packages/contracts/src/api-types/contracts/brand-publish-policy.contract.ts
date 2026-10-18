import { z } from 'zod';
import type {
  BrandPublishRequiredCheck,
  IBrandPolicyViolation,
  IBrandPublishPolicy,
} from '../../interfaces/organization/brand-publish-policy.interface';

/**
 * Brand OS Policy (#7339): the shape of the Policy section and the
 * deterministic rules the single publish gate checks. The gate itself is
 * `evaluateAgentPublishPolicy`; this module only says which rules a draft
 * breaks. Nothing here can permit a publish.
 */

export const BRAND_PUBLISH_POLICY_LIMITS = {
  bannedClaims: 50,
  bannedPhrases: 100,
  bannedTopics: 50,
  entryLength: 200,
  maxPostsPerDay: 100,
  maxPostsPerWeek: 700,
  platforms: 32,
} as const;

export const brandPublishAutonomyValues = ['earned', 'review'] as const;
export const brandPublishRequiredCheckValues = [
  'moderation',
  'brand_validation',
  'fact_check',
] as const;
export const brandPublishDraftFormatValues = [
  'text',
  'image',
  'video',
] as const;
export const brandPolicyRuleValues = [
  'policy_not_approved',
  'platform_requires_review',
  'format_requires_review',
  'video_always_reviewed',
  'banned_phrase',
  'banned_topic',
  'banned_claim',
  'guardrail',
  'daily_cap',
  'weekly_cap',
  'quiet_hours',
  'min_quality_score',
  'required_check',
  'policy_judge_unavailable',
] as const;

/** Checks the brand-validation receipt settles; the judge owns `moderation`. */
const RECEIPT_CHECKS: readonly BrandPublishRequiredCheck[] = [
  'brand_validation',
  'fact_check',
];

const DAY_MS = 86_400_000;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidPolicyTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const autonomy = z.enum(brandPublishAutonomyValues);
const entries = (max: number) =>
  z
    .array(
      z.string().trim().min(1).max(BRAND_PUBLISH_POLICY_LIMITS.entryLength),
    )
    .max(max);

export const brandPublishPolicySchema: z.ZodType<IBrandPublishPolicy> = z
  .strictObject({
    version: z.literal(1),
    timezone: z.string().min(1).max(64).refine(isValidPolicyTimezone, {
      message: 'Unknown timezone',
    }),
    autonomy: z.strictObject({
      platforms: z
        .record(z.string().trim().min(1).max(40), autonomy)
        .refine(
          (value) =>
            Object.keys(value).length <= BRAND_PUBLISH_POLICY_LIMITS.platforms,
          { message: 'Too many platforms' },
        ),
      formats: z.strictObject({ image: autonomy, text: autonomy }),
    }),
    maxPostsPerDay: z
      .number()
      .int()
      .min(1)
      .max(BRAND_PUBLISH_POLICY_LIMITS.maxPostsPerDay)
      .nullable(),
    maxPostsPerWeek: z
      .number()
      .int()
      .min(1)
      .max(BRAND_PUBLISH_POLICY_LIMITS.maxPostsPerWeek)
      .nullable(),
    quietHours: z
      .strictObject({
        end: z.string().regex(LOCAL_TIME),
        start: z.string().regex(LOCAL_TIME),
      })
      .refine((value) => value.start !== value.end, {
        message: 'Quiet hours need a different start and end',
      })
      .nullable(),
    bannedTopics: entries(BRAND_PUBLISH_POLICY_LIMITS.bannedTopics),
    bannedPhrases: entries(BRAND_PUBLISH_POLICY_LIMITS.bannedPhrases),
    bannedClaims: entries(BRAND_PUBLISH_POLICY_LIMITS.bannedClaims),
    minQualityScore: z.number().min(0).max(100).nullable(),
    requiredChecks: z
      .array(z.enum(brandPublishRequiredCheckValues))
      .max(brandPublishRequiredCheckValues.length)
      .refine((value) => new Set(value).size === value.length, {
        message: 'Duplicate required check',
      }),
  })
  .refine(
    (value) =>
      value.maxPostsPerDay === null ||
      value.maxPostsPerWeek === null ||
      value.maxPostsPerDay <= value.maxPostsPerWeek,
    { message: 'The daily cap cannot exceed the weekly cap' },
  );

export const brandPolicyViolationSchema: z.ZodType<IBrandPolicyViolation> =
  z.strictObject({
    detail: z.string().min(1).max(500),
    rule: z.enum(brandPolicyRuleValues),
  });

/** A starting Policy: nothing banned, text and image earn autonomy, video reviewed. */
export function createDefaultBrandPublishPolicy(
  timezone = 'UTC',
): IBrandPublishPolicy {
  return {
    autonomy: { formats: { image: 'earned', text: 'earned' }, platforms: {} },
    bannedClaims: [],
    bannedPhrases: [],
    bannedTopics: [],
    maxPostsPerDay: null,
    maxPostsPerWeek: null,
    minQualityScore: null,
    quietHours: null,
    requiredChecks: [],
    timezone,
    version: 1,
  };
}

/** The approved Policy, or null when the stored value is absent or invalid. */
export function parseBrandPublishPolicy(
  value: unknown,
): IBrandPublishPolicy | null {
  const parsed = brandPublishPolicySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** True when banned topics, banned claims or caption moderation need the judge. */
export function needsBrandPolicyJudge(
  policy: IBrandPublishPolicy | null,
): boolean {
  return Boolean(
    policy &&
      (policy.bannedTopics.length > 0 ||
        policy.bannedClaims.length > 0 ||
        policy.requiredChecks.includes('moderation')),
  );
}

function normalizeForMatch(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

const WORD = /[\p{L}\p{N}]/u;

/**
 * Banned phrases the text contains: a case-insensitive literal match that
 * respects word edges, so "AI" does not match inside "maintain".
 */
export function findBannedPhrases(
  text: string,
  phrases: readonly string[],
): string[] {
  const haystack = normalizeForMatch(text);
  const found: string[] = [];
  for (const phrase of phrases) {
    const needle = normalizeForMatch(phrase.trim());
    if (!needle) continue;
    const needsLeadingEdge = WORD.test(needle[0] ?? '');
    const needsTrailingEdge = WORD.test(needle[needle.length - 1] ?? '');
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      const before = haystack[index - 1] ?? '';
      const after = haystack[index + needle.length] ?? '';
      if (
        (!needsLeadingEdge || !WORD.test(before)) &&
        (!needsTrailingEdge || !WORD.test(after))
      ) {
        found.push(phrase.trim());
        break;
      }
      index = haystack.indexOf(needle, index + 1);
    }
  }
  return found;
}

interface LocalParts {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
}

function localParts(at: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    month: read('month'),
    second: read('second'),
    year: read('year'),
  };
}

/** Whether `at` falls inside the quiet hours, read in the Policy timezone. */
export function isWithinQuietHours(
  at: Date,
  quietHours: IBrandPublishPolicy['quietHours'],
  timezone: string,
): boolean {
  if (!quietHours) return false;
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number);
    return (hours ?? 0) * 60 + (minutes ?? 0);
  };
  const local = localParts(at, timezone);
  const minute = local.hour * 60 + local.minute;
  const start = toMinutes(quietHours.start);
  const end = toMinutes(quietHours.end);
  return start < end
    ? minute >= start && minute < end
    : minute >= start || minute < end;
}

export interface BrandPolicyWindows {
  dayEnd: Date;
  dayStart: Date;
  weekEnd: Date;
  weekStart: Date;
}

/**
 * The calendar day and Monday-start week containing `at`, in the Policy
 * timezone, as UTC instants. The caps count posts inside these windows.
 */
export function resolveBrandPolicyWindows(
  at: Date,
  timezone: string,
): BrandPolicyWindows {
  const local = localParts(at, timezone);
  const wallClock = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  const offset = wallClock - Math.floor(at.getTime() / 1000) * 1000;
  const localMidnight = Date.UTC(local.year, local.month - 1, local.day);
  const dayStart = localMidnight - offset;
  const daysSinceMonday = (new Date(localMidnight).getUTCDay() + 6) % 7;
  const weekStart = dayStart - daysSinceMonday * DAY_MS;
  return {
    dayEnd: new Date(dayStart + DAY_MS),
    dayStart: new Date(dayStart),
    weekEnd: new Date(weekStart + 7 * DAY_MS),
    weekStart: new Date(weekStart),
  };
}

export const brandPolicyEvaluationInputSchema = z.strictObject({
  /** The approved Policy; null when the brand has none. */
  policy: brandPublishPolicySchema.nullable(),
  draft: z.strictObject({
    format: z.enum(brandPublishDraftFormatValues),
    platform: z.string(),
    /** ISO instant the post would go out. */
    publishAt: z.iso.datetime({ offset: true }),
    /** 0–100, when one was measured. */
    qualityScore: z.number().min(0).max(100).nullable(),
    text: z.string().max(100_000),
  }),
  /** Other posts of the brand already going out in the Policy windows. */
  usage: z.strictObject({
    postsInDay: z.number().int().min(0),
    postsInWeek: z.number().int().min(0),
  }),
  /** Receipt-settled checks this draft passed (`brand_validation`, `fact_check`). */
  passedChecks: z.array(z.enum(brandPublishRequiredCheckValues)),
  /** What the judge found for banned topics, claims and caption moderation. */
  judgeViolations: z.array(brandPolicyViolationSchema),
});

export type BrandPolicyEvaluationInput = z.infer<
  typeof brandPolicyEvaluationInputSchema
>;

/**
 * The deterministic rules a draft breaks, in a stable order: missing Policy,
 * video, autonomy, banned phrases, caps, quiet hours, score, receipt checks.
 * The judge's findings are not included; the gate appends them.
 */
export function evaluateBrandPublishPolicyRules(
  input: BrandPolicyEvaluationInput,
): IBrandPolicyViolation[] {
  const { draft, policy } = input;
  const violations: IBrandPolicyViolation[] = [];
  if (!policy) {
    violations.push({
      detail:
        'This brand has no approved Policy, so every autonomous draft stays in review.',
      rule: 'policy_not_approved',
    });
  }
  if (draft.format === 'video') {
    violations.push({
      detail: 'Video is always reviewed by a member before it publishes.',
      rule: 'video_always_reviewed',
    });
  }
  if (!policy) return violations;

  if (policy.autonomy.platforms[draft.platform] === 'review') {
    violations.push({
      detail: `The Policy requires review for every ${draft.platform} post.`,
      rule: 'platform_requires_review',
    });
  }
  if (
    draft.format !== 'video' &&
    policy.autonomy.formats[draft.format] === 'review'
  ) {
    violations.push({
      detail: `The Policy requires review for every ${draft.format} post.`,
      rule: 'format_requires_review',
    });
  }
  for (const phrase of findBannedPhrases(draft.text, policy.bannedPhrases)) {
    violations.push({
      detail: `Contains the banned phrase "${phrase}".`.slice(0, 500),
      rule: 'banned_phrase',
    });
  }
  if (
    policy.maxPostsPerDay !== null &&
    input.usage.postsInDay >= policy.maxPostsPerDay
  ) {
    violations.push({
      detail: `The brand already has ${input.usage.postsInDay} posts that day; the Policy allows ${policy.maxPostsPerDay}.`,
      rule: 'daily_cap',
    });
  }
  if (
    policy.maxPostsPerWeek !== null &&
    input.usage.postsInWeek >= policy.maxPostsPerWeek
  ) {
    violations.push({
      detail: `The brand already has ${input.usage.postsInWeek} posts that week; the Policy allows ${policy.maxPostsPerWeek}.`,
      rule: 'weekly_cap',
    });
  }
  if (
    policy.quietHours &&
    isWithinQuietHours(
      new Date(draft.publishAt),
      policy.quietHours,
      policy.timezone,
    )
  ) {
    violations.push({
      detail: `Falls in quiet hours (${policy.quietHours.start}–${policy.quietHours.end} ${policy.timezone}).`,
      rule: 'quiet_hours',
    });
  }
  if (policy.minQualityScore !== null) {
    if (draft.qualityScore === null) {
      violations.push({
        detail: `No quality score was recorded; the Policy requires ${policy.minQualityScore}.`,
        rule: 'min_quality_score',
      });
    } else if (draft.qualityScore < policy.minQualityScore) {
      violations.push({
        detail: `Scored ${draft.qualityScore}; the Policy requires ${policy.minQualityScore}.`,
        rule: 'min_quality_score',
      });
    }
  }
  for (const check of policy.requiredChecks) {
    if (RECEIPT_CHECKS.includes(check) && !input.passedChecks.includes(check)) {
      violations.push({
        detail: `The required ${check.replace('_', ' ')} check has not passed.`,
        rule: 'required_check',
      });
    }
  }
  return violations;
}
