import { describe, expect, it } from 'vitest';
import {
  type BrandPolicyEvaluationInput,
  brandPublishPolicySchema,
  createDefaultBrandPublishPolicy,
  evaluateBrandPublishPolicyRules,
  findBannedPhrases,
  isWithinQuietHours,
  needsBrandPolicyJudge,
  parseBrandPublishPolicy,
  resolveBrandPolicyWindows,
} from '../../src/api-types/contracts/brand-publish-policy.contract';
import type { IBrandPublishPolicy } from '../../src/interfaces/organization/brand-publish-policy.interface';

function input(
  policy: IBrandPublishPolicy,
  draft: Partial<BrandPolicyEvaluationInput['draft']> = {},
  rest: Partial<Omit<BrandPolicyEvaluationInput, 'draft' | 'policy'>> = {},
): BrandPolicyEvaluationInput {
  return {
    draft: {
      format: 'text',
      platform: 'linkedin',
      publishAt: '2026-10-19T12:00:00.000Z',
      qualityScore: null,
      text: 'A clean draft about our launch.',
      ...draft,
    },
    judgeViolations: [],
    passedChecks: [],
    policy,
    usage: { postsInDay: 0, postsInWeek: 0 },
    ...rest,
  };
}

function rules(value: BrandPolicyEvaluationInput): string[] {
  return evaluateBrandPublishPolicyRules(value).map(
    (violation) => violation.rule,
  );
}

describe('brandPublishPolicySchema', () => {
  it('accepts the default Policy', () => {
    expect(
      brandPublishPolicySchema.safeParse(createDefaultBrandPublishPolicy())
        .success,
    ).toBe(true);
  });

  it('rejects an unknown timezone, a video autonomy and a daily cap above the weekly cap', () => {
    const policy = createDefaultBrandPublishPolicy();
    expect(
      brandPublishPolicySchema.safeParse({ ...policy, timezone: 'Mars/Base' })
        .success,
    ).toBe(false);
    expect(
      brandPublishPolicySchema.safeParse({
        ...policy,
        autonomy: {
          ...policy.autonomy,
          formats: { ...policy.autonomy.formats, video: 'earned' },
        },
      }).success,
    ).toBe(false);
    expect(
      brandPublishPolicySchema.safeParse({
        ...policy,
        maxPostsPerDay: 5,
        maxPostsPerWeek: 3,
      }).success,
    ).toBe(false);
  });

  it('parses an invalid stored Policy as no Policy', () => {
    expect(parseBrandPublishPolicy({ version: 2 })).toBeNull();
    expect(parseBrandPublishPolicy(undefined)).toBeNull();
  });
});

describe('findBannedPhrases', () => {
  it('matches case-insensitively on word edges', () => {
    expect(
      findBannedPhrases('We GUARANTEE results', ['guarantee', 'AI']),
    ).toEqual(['guarantee']);
    expect(findBannedPhrases('Maintain the plan', ['AI'])).toEqual([]);
    expect(
      findBannedPhrases('Get rich   quick now', ['get rich quick']),
    ).toEqual(['get rich quick']);
  });
});

describe('quiet hours and windows', () => {
  it('reads quiet hours in the Policy timezone, across midnight', () => {
    const quiet = { end: '07:00', start: '22:00' };
    // 23:30 in New York (EDT, UTC-4).
    expect(
      isWithinQuietHours(
        new Date('2026-10-20T03:30:00.000Z'),
        quiet,
        'America/New_York',
      ),
    ).toBe(true);
    // 12:00 in New York.
    expect(
      isWithinQuietHours(
        new Date('2026-10-19T16:00:00.000Z'),
        quiet,
        'America/New_York',
      ),
    ).toBe(false);
  });

  it('resolves the local day and Monday-start week', () => {
    // Monday 2026-10-19 01:00 in Paris (CEST, UTC+2) is Sunday 23:00 UTC.
    const windows = resolveBrandPolicyWindows(
      new Date('2026-10-18T23:00:00.000Z'),
      'Europe/Paris',
    );
    expect(windows.dayStart.toISOString()).toBe('2026-10-18T22:00:00.000Z');
    expect(windows.dayEnd.toISOString()).toBe('2026-10-19T22:00:00.000Z');
    expect(windows.weekStart.toISOString()).toBe('2026-10-18T22:00:00.000Z');
    expect(windows.weekEnd.toISOString()).toBe('2026-10-25T22:00:00.000Z');
  });
});

describe('evaluateBrandPublishPolicyRules', () => {
  it('passes a clean text draft under the default Policy', () => {
    expect(rules(input(createDefaultBrandPublishPolicy()))).toEqual([]);
  });

  it('always reviews video, whatever the Policy says', () => {
    expect(
      rules(input(createDefaultBrandPublishPolicy(), { format: 'video' })),
    ).toEqual(['video_always_reviewed']);
  });

  it('passes a clean draft under the default Policy', () => {
    expect(rules(input(createDefaultBrandPublishPolicy()))).toEqual([]);
  });

  it('names every deterministic rule the draft breaks', () => {
    const policy: IBrandPublishPolicy = {
      ...createDefaultBrandPublishPolicy('UTC'),
      autonomy: {
        formats: { image: 'earned', text: 'review' },
        platforms: { linkedin: 'review' },
      },
      bannedPhrases: ['launch'],
      maxPostsPerDay: 2,
      maxPostsPerWeek: 5,
      minQualityScore: 80,
      quietHours: { end: '13:00', start: '11:00' },
      requiredChecks: ['brand_validation', 'moderation'],
    };
    expect(
      rules(
        input(
          policy,
          { qualityScore: 60 },
          { usage: { postsInDay: 2, postsInWeek: 5 } },
        ),
      ),
    ).toEqual([
      'platform_requires_review',
      'format_requires_review',
      'banned_phrase',
      'daily_cap',
      'weekly_cap',
      'quiet_hours',
      'min_quality_score',
      'required_check',
    ]);
  });

  it('holds an unscored draft when a minimum score is set', () => {
    const policy = {
      ...createDefaultBrandPublishPolicy(),
      minQualityScore: 50,
    };
    expect(rules(input(policy))).toEqual(['min_quality_score']);
    expect(rules(input(policy, { qualityScore: 50 }))).toEqual([]);
  });

  it('settles receipt checks from the passed checks', () => {
    const policy: IBrandPublishPolicy = {
      ...createDefaultBrandPublishPolicy(),
      requiredChecks: ['brand_validation', 'fact_check'],
    };
    expect(
      rules(
        input(policy, {}, { passedChecks: ['brand_validation', 'fact_check'] }),
      ),
    ).toEqual([]);
  });
});

describe('needsBrandPolicyJudge', () => {
  it('runs the judge only for topics, claims or caption moderation', () => {
    const policy = createDefaultBrandPublishPolicy();
    expect(needsBrandPolicyJudge(policy)).toBe(false);
    expect(needsBrandPolicyJudge({ ...policy, bannedPhrases: ['x'] })).toBe(
      false,
    );
    expect(
      needsBrandPolicyJudge({ ...policy, bannedTopics: ['politics'] }),
    ).toBe(true);
    expect(
      needsBrandPolicyJudge({ ...policy, requiredChecks: ['moderation'] }),
    ).toBe(true);
  });
});
