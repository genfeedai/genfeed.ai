import {
  harnessProfileBrandFilter,
  pickActiveHarnessProfile,
} from '@api/collections/harness-profiles/services/harness-profiles.service';
import { BrandPolicyJudgeService } from '@api/services/brand-publish-policy/brand-policy-judge.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { readRecordOrEmpty as readRecord } from '@api/shared/utils/object/read-record-or-empty.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { PostCategory, TargetExecutionState } from '@genfeedai/contracts';
import {
  BRAND_PUBLISH_POLICY_LIMITS,
  type BrandPolicyEvaluationInput,
  createDefaultBrandPublishPolicy,
  evaluateBrandPublishPolicyRules,
  needsBrandPolicyJudge,
  parseBrandPublishPolicy,
  resolveBrandPolicyWindows,
} from '@genfeedai/contracts/api-types/contracts/brand-publish-policy.contract';
import type {
  BrandPublishDraftFormat,
  BrandPublishRequiredCheck,
  IBrandPolicyViolation,
  IBrandPublishPolicy,
} from '@genfeedai/contracts/interfaces';
import {
  BrandOsRevisionStatus,
  IngredientCategory,
  type Prisma,
} from '@genfeedai/prisma';
import { Injectable, Optional } from '@nestjs/common';

type PolicyDb = Pick<
  Prisma.TransactionClient,
  | '$executeRaw'
  | 'brand'
  | 'brandOsRevision'
  | 'ingredient'
  | 'post'
  | 'profile'
>;

const MAX_GUARDRAILS = 50;
const VIDEO_POST_CATEGORIES = new Set<string>([
  PostCategory.VIDEO,
  PostCategory.REEL,
]);
const VIDEO_INGREDIENT_CATEGORIES = new Set<string>([
  IngredientCategory.VIDEO,
  IngredientCategory.VIDEO_EDIT,
  IngredientCategory.AVATAR,
]);
const COUNTED_STATES = [
  TargetExecutionState.SCHEDULED,
  TargetExecutionState.PUBLISHING,
  TargetExecutionState.PUBLISHED,
];

/** The draft facts the brand Policy is checked against. */
export interface BrandPolicyDraftFacts {
  brandId: string;
  format: BrandPublishDraftFormat;
  organizationId: string;
  /** Receipt-settled checks the draft passed. */
  passedChecks?: readonly BrandPublishRequiredCheck[];
  platform: string;
  /** Excluded from the caps, so a draft never counts against itself. */
  postId?: string;
  publishAt: Date;
  qualityScore?: number | null;
  text: string;
}

export interface BrandPolicyEvaluationOptions {
  /** The judge runs only when nothing else already holds the draft. */
  isJudgeEnabled: boolean;
}

interface EffectiveBrandPolicy {
  guardrails: string[];
  policy: IBrandPublishPolicy;
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(
          (item) =>
            item.length > 0 &&
            item.length <= BRAND_PUBLISH_POLICY_LIMITS.entryLength,
        )
    : [];
}

function unique(values: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLocaleLowerCase('en-US');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length === limit) break;
  }
  return result;
}

/** A draft's format at the gate: any video makes it a video. */
export function resolveBrandPolicyDraftFormat(
  postCategory: string | null | undefined,
  ingredientCategories: readonly string[],
): BrandPublishDraftFormat {
  if (
    (postCategory && VIDEO_POST_CATEGORIES.has(postCategory)) ||
    ingredientCategories.some((category) =>
      VIDEO_INGREDIENT_CATEGORIES.has(category),
    )
  )
    return 'video';
  return ingredientCategories.length > 0 || postCategory === PostCategory.IMAGE
    ? 'image'
    : 'text';
}

/**
 * Reads a brand's active Policy (#7339) and turns a draft into the brand
 * Policy input of the single publish gate, `evaluateAgentPublishPolicy`.
 *
 * The active Policy is the Policy section of the approved Brand OS revision.
 * The prompt-only rules that shaped the draft are folded in, so the same rules
 * are checked after generation: brand and harness banned phrases join the
 * Policy's literal list, and harness guardrails and the approved voice's
 * "avoid sounding like" go to the judge. Deterministic rules run first; the
 * judge runs only when they all pass and the caller says it can matter.
 */
@Injectable()
export class BrandPublishPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly judge?: BrandPolicyJudgeService,
  ) {}

  async buildEvaluation(
    draftFacts: BrandPolicyDraftFacts,
    options: BrandPolicyEvaluationOptions,
    db: PolicyDb = this.prisma,
  ): Promise<BrandPolicyEvaluationInput> {
    // An unreadable schedule is judged as a publish now.
    const facts = Number.isNaN(draftFacts.publishAt.getTime())
      ? { ...draftFacts, publishAt: new Date() }
      : draftFacts;
    const { guardrails, policy } = await this.loadEffectivePolicy(
      db,
      facts.organizationId,
      facts.brandId,
    );
    const input: BrandPolicyEvaluationInput = {
      draft: {
        format: facts.format,
        platform: facts.platform,
        publishAt: facts.publishAt.toISOString(),
        qualityScore:
          typeof facts.qualityScore === 'number' &&
          Number.isFinite(facts.qualityScore)
            ? Math.min(100, Math.max(0, facts.qualityScore))
            : null,
        text: facts.text,
      },
      judgeViolations: [],
      passedChecks: [...(facts.passedChecks ?? [])],
      policy,
      usage: await this.countUsage(db, facts, policy),
    };
    if (
      !options.isJudgeEnabled ||
      (!needsBrandPolicyJudge(policy) && guardrails.length === 0) ||
      evaluateBrandPublishPolicyRules(input).length > 0
    )
      return input;
    const request = {
      bannedClaims: policy.bannedClaims,
      bannedTopics: policy.bannedTopics,
      brandId: facts.brandId,
      guardrails,
      isModerationRequired: policy.requiredChecks.includes('moderation'),
      organizationId: facts.organizationId,
      text: facts.text,
    };
    // Inside a transaction the judge only reads its cache: a model call would
    // hold the transaction's locks past its timeout. Callers judge first.
    const isInTransaction = db !== this.prisma;
    const judged = !this.judge
      ? undefined
      : isInTransaction
        ? this.judge.peek(request)
        : await this.judge.judge(request);
    input.judgeViolations = judged ?? [
      {
        detail: this.judge
          ? 'The Policy judge had not checked this draft before the publish step, so banned topics, claims and moderation were not checked.'
          : 'The Policy judge is not available here, so banned topics, claims and moderation were not checked.',
        rule: 'policy_judge_unavailable',
      },
    ];
    return input;
  }

  /**
   * Records the rules a draft broke on its review item. A raw write, so the
   * post's `updatedAt`, which review and approval versions bind to, does not
   * move; an unchanged list is not written.
   */
  async recordViolations(
    organizationId: string,
    postId: string,
    violations: readonly IBrandPolicyViolation[],
    db: PolicyDb = this.prisma,
  ): Promise<void> {
    const json = JSON.stringify(violations);
    await db.$executeRaw`UPDATE "posts" SET "policyViolations" = ${json}::jsonb WHERE "id" = ${postId} AND "organizationId" = ${organizationId} AND "isDeleted" = false AND "policyViolations" IS DISTINCT FROM ${json}::jsonb`;
  }

  /** The categories of the attached media, for the draft format. */
  async readIngredientCategories(
    organizationId: string,
    ingredientIds: readonly string[],
    db: PolicyDb = this.prisma,
  ): Promise<string[]> {
    if (ingredientIds.length === 0) return [];
    const rows = await db.ingredient.findMany({
      select: { category: true },
      where: scopedWhere(organizationId, { id: { in: [...ingredientIds] } }),
    });
    return rows.map((row) => row.category);
  }

  /** The facts of a saved post, for a gate that only knows the post. */
  async describePost(
    organizationId: string,
    postId: string,
    db: PolicyDb = this.prisma,
  ): Promise<BrandPolicyDraftFacts | null> {
    const post = await db.post.findFirst({
      select: {
        brandId: true,
        brandedReceiptState: true,
        category: true,
        description: true,
        ingredientLinks: {
          select: { ingredient: { select: { category: true } } },
          where: { ingredient: { isDeleted: false, organizationId } },
        },
        platform: true,
        scheduledDate: true,
      },
      where: scopedWhere(organizationId, { id: postId }),
    });
    if (!post) return null;
    return {
      brandId: post.brandId,
      format: resolveBrandPolicyDraftFormat(
        post.category,
        post.ingredientLinks.map((link) => link.ingredient.category),
      ),
      organizationId,
      passedChecks:
        post.brandedReceiptState === 'ready'
          ? ['brand_validation', 'fact_check']
          : [],
      platform: post.platform ?? '',
      postId,
      publishAt: post.scheduledDate ?? new Date(),
      text: post.description,
    };
  }

  private async loadEffectivePolicy(
    db: PolicyDb,
    organizationId: string,
    brandId: string,
  ): Promise<EffectiveBrandPolicy> {
    const revision = brandId
      ? await db.brandOsRevision.findFirst({
          select: { content: true },
          where: scopedWhere(organizationId, {
            brandId,
            status: BrandOsRevisionStatus.APPROVED,
          }),
        })
      : null;
    const content = readRecord(revision?.content);
    // A brand that has not approved a Policy runs under the default one.
    const policy =
      parseBrandPublishPolicy(content.policy) ??
      createDefaultBrandPublishPolicy();

    const brand = await db.brand.findFirst({
      select: { agentConfig: true },
      where: scopedWhere(organizationId, { id: brandId }),
    });
    const profiles = await db.profile.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { data: true },
      where: scopedWhere(organizationId, harnessProfileBrandFilter(brandId)),
    });
    const profile = pickActiveHarnessProfile(
      profiles.map((row) => {
        const data = readRecord(row.data);
        return {
          data,
          isDefault: Boolean(data.isDefault),
          status:
            data.status === 'draft' ? ('draft' as const) : ('active' as const),
        };
      }),
    )?.data;
    const doNotSoundLike = readStrings(
      readRecord(readRecord(content.fields).voiceDoNotSoundLike).currentValue,
    );
    return {
      guardrails: unique(
        [
          ...readStrings(profile?.guardrails),
          ...doNotSoundLike.map((value) => `Do not sound like: ${value}`),
        ],
        MAX_GUARDRAILS,
      ),
      policy: {
        ...policy,
        bannedPhrases: unique(
          [
            ...policy.bannedPhrases,
            ...readStrings(
              readRecord(readRecord(brand?.agentConfig).voice).bannedPhrases,
            ),
            ...readStrings(readRecord(profile?.voice).bannedPhrases),
          ],
          BRAND_PUBLISH_POLICY_LIMITS.bannedPhrases,
        ),
      },
    };
  }

  private async countUsage(
    db: PolicyDb,
    facts: BrandPolicyDraftFacts,
    policy: IBrandPublishPolicy,
  ): Promise<BrandPolicyEvaluationInput['usage']> {
    if (policy.maxPostsPerDay === null && policy.maxPostsPerWeek === null)
      return { postsInDay: 0, postsInWeek: 0 };
    const windows = resolveBrandPolicyWindows(facts.publishAt, policy.timezone);
    const count = (start: Date, end: Date) =>
      db.post.count({
        where: scopedWhere(facts.organizationId, {
          brandId: facts.brandId,
          parentId: null,
          targetExecutionState: { in: COUNTED_STATES },
          ...(facts.postId ? { id: { not: facts.postId } } : {}),
          OR: [
            { scheduledDate: { gte: start, lt: end } },
            { publishedAt: { gte: start, lt: end }, scheduledDate: null },
          ],
        }),
      });
    return {
      postsInDay:
        policy.maxPostsPerDay === null
          ? 0
          : await count(windows.dayStart, windows.dayEnd),
      postsInWeek:
        policy.maxPostsPerWeek === null
          ? 0
          : await count(windows.weekStart, windows.weekEnd),
    };
  }
}
