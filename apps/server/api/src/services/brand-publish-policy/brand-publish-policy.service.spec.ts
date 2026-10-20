import type { BrandPolicyJudgeService } from '@api/services/brand-publish-policy/brand-policy-judge.service';
import {
  type BrandPolicyDraftFacts,
  BrandPublishPolicyService,
  resolveBrandPolicyDraftFormat,
} from '@api/services/brand-publish-policy/brand-publish-policy.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PostCategory, TargetExecutionState } from '@genfeedai/contracts';
import {
  createDefaultBrandPublishPolicy,
  evaluateBrandPublishPolicyRules,
} from '@genfeedai/contracts/api-types/contracts/brand-publish-policy.contract';
import type {
  IBrandPolicyViolation,
  IBrandPublishPolicy,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const FACTS: BrandPolicyDraftFacts = {
  brandId: 'brand-1',
  format: 'text',
  organizationId: 'org-1',
  platform: 'twitter',
  postId: 'post-1',
  publishAt: new Date('2026-10-20T10:00:00.000Z'),
  qualityScore: 80,
  text: 'A calm launch note for founders.',
};

function makeDb(policy: IBrandPublishPolicy | null | 'invalid') {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
    brand: {
      findFirst: vi.fn().mockResolvedValue({
        agentConfig: { voice: { bannedPhrases: ['synergy', 'Synergy', 7] } },
      }),
    },
    brandOsRevision: {
      findFirst: vi.fn().mockResolvedValue(
        policy === null
          ? null
          : {
              content: {
                fields: {
                  voiceDoNotSoundLike: {
                    currentValue: ['a used car advert'],
                  },
                },
                policy:
                  policy === 'invalid'
                    ? { ...createDefaultBrandPublishPolicy(), version: 2 }
                    : policy,
              },
            },
      ),
    },
    ingredient: {
      findMany: vi.fn().mockResolvedValue([{ category: 'VIDEO' }]),
    },
    post: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn(),
    },
    profile: {
      findMany: vi.fn().mockResolvedValue([
        {
          data: {
            guardrails: ['Never mention competitors'],
            isDefault: true,
            status: 'active',
            voice: { bannedPhrases: ['game changer'] },
          },
        },
      ]),
    },
  };
}

function makeJudge(violations: IBrandPolicyViolation[] = []) {
  return {
    judge: vi.fn().mockResolvedValue(violations),
    peek: vi.fn().mockReturnValue(undefined),
  };
}

function makeService(
  db: ReturnType<typeof makeDb>,
  judge?: ReturnType<typeof makeJudge>,
) {
  return new BrandPublishPolicyService(
    db as unknown as PrismaService,
    judge as unknown as BrandPolicyJudgeService | undefined,
  );
}

describe('resolveBrandPolicyDraftFormat', () => {
  it('reads any video as a video draft', () => {
    expect(resolveBrandPolicyDraftFormat(PostCategory.VIDEO, [])).toBe('video');
    expect(resolveBrandPolicyDraftFormat(PostCategory.REEL, [])).toBe('video');
    expect(
      resolveBrandPolicyDraftFormat(PostCategory.TEXT, ['IMAGE', 'VIDEO']),
    ).toBe('video');
    expect(resolveBrandPolicyDraftFormat(null, ['AVATAR'])).toBe('video');
  });

  it('reads attached media as an image and nothing as text', () => {
    expect(resolveBrandPolicyDraftFormat(PostCategory.TEXT, ['IMAGE'])).toBe(
      'image',
    );
    expect(resolveBrandPolicyDraftFormat(PostCategory.IMAGE, [])).toBe('image');
    expect(resolveBrandPolicyDraftFormat(PostCategory.TEXT, [])).toBe('text');
  });
});

describe('BrandPublishPolicyService', () => {
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    db = makeDb(createDefaultBrandPublishPolicy());
  });

  it('reads the approved revision of the brand within the tenant', async () => {
    await makeService(db).buildEvaluation(FACTS, { isJudgeEnabled: false });

    expect(db.brandOsRevision.findFirst).toHaveBeenCalledWith({
      select: { content: true },
      where: {
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
        status: 'APPROVED',
      },
    });
    expect(db.brand.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
      }),
    );
  });

  it('judges by the default Policy when none is approved or the stored one is invalid', async () => {
    for (const stored of [null, 'invalid'] as const) {
      const input = await makeService(makeDb(stored)).buildEvaluation(FACTS, {
        isJudgeEnabled: true,
      });
      expect(input.policy).toMatchObject({
        ...createDefaultBrandPublishPolicy(),
        bannedPhrases: ['synergy', 'game changer'],
      });
      expect(evaluateBrandPublishPolicyRules(input)).toEqual([]);
    }
  });

  it('folds brand and harness banned phrases into the literal list, once each', async () => {
    const input = await makeService(db).buildEvaluation(FACTS, {
      isJudgeEnabled: false,
    });

    expect(input.policy?.bannedPhrases).toEqual(['synergy', 'game changer']);
    const held = await makeService(db).buildEvaluation(
      { ...FACTS, text: 'This is a game changer.' },
      { isJudgeEnabled: false },
    );
    expect(evaluateBrandPublishPolicyRules(held)).toEqual([
      expect.objectContaining({ rule: 'banned_phrase' }),
    ]);
  });

  it('sends harness guardrails and the approved "do not sound like" to the judge', async () => {
    const judge = makeJudge();

    await makeService(db, judge).buildEvaluation(FACTS, {
      isJudgeEnabled: true,
    });

    expect(judge.judge).toHaveBeenCalledWith({
      bannedClaims: [],
      bannedTopics: [],
      brandId: 'brand-1',
      guardrails: [
        'Never mention competitors',
        'Do not sound like: a used car advert',
      ],
      isModerationRequired: false,
      organizationId: 'org-1',
      text: FACTS.text,
    });
  });

  it('skips the judge when the Policy and the guardrails list nothing', async () => {
    db.profile.findMany.mockResolvedValue([]);
    db.brandOsRevision.findFirst.mockResolvedValue({
      content: { policy: createDefaultBrandPublishPolicy() },
    });
    const judge = makeJudge();

    await makeService(db, judge).buildEvaluation(FACTS, {
      isJudgeEnabled: true,
    });

    expect(judge.judge).not.toHaveBeenCalled();
  });

  it('skips the judge when the caller or a deterministic rule already holds the draft', async () => {
    const judge = makeJudge();
    const service = makeService(db, judge);

    await service.buildEvaluation(FACTS, { isJudgeEnabled: false });
    await service.buildEvaluation(
      { ...FACTS, format: 'video' },
      { isJudgeEnabled: true },
    );

    expect(judge.judge).not.toHaveBeenCalled();
  });

  it('records the judge findings, and fails closed without a judge', async () => {
    const finding: IBrandPolicyViolation = {
      detail: 'Breaks the brand guardrail.',
      rule: 'guardrail',
    };
    const judged = await makeService(db, makeJudge([finding])).buildEvaluation(
      FACTS,
      { isJudgeEnabled: true },
    );
    expect(judged.judgeViolations).toEqual([finding]);

    const unjudged = await makeService(db).buildEvaluation(FACTS, {
      isJudgeEnabled: true,
    });
    expect(unjudged.judgeViolations).toEqual([
      expect.objectContaining({ rule: 'policy_judge_unavailable' }),
    ]);
  });

  it('only reads the judge cache inside a transaction, and holds a draft it has not judged', async () => {
    const judge = makeJudge();
    const service = makeService(db, judge);
    const transaction = makeDb(createDefaultBrandPublishPolicy());

    const unjudged = await service.buildEvaluation(
      FACTS,
      { isJudgeEnabled: true },
      transaction as never,
    );
    expect(unjudged.judgeViolations).toEqual([
      expect.objectContaining({ rule: 'policy_judge_unavailable' }),
    ]);

    judge.peek.mockReturnValue([]);
    const cached = await service.buildEvaluation(
      FACTS,
      { isJudgeEnabled: true },
      transaction as never,
    );
    expect(cached.judgeViolations).toEqual([]);
    expect(judge.judge).not.toHaveBeenCalled();
  });

  it('counts only live top-level posts of the brand in the local day and week, never this one', async () => {
    db.brandOsRevision.findFirst.mockResolvedValue({
      content: {
        policy: {
          ...createDefaultBrandPublishPolicy('Europe/Paris'),
          maxPostsPerDay: 2,
          maxPostsPerWeek: 5,
        },
      },
    });
    db.post.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3);

    const input = await makeService(db).buildEvaluation(FACTS, {
      isJudgeEnabled: false,
    });

    expect(input.usage).toEqual({ postsInDay: 2, postsInWeek: 3 });
    expect(db.post.count).toHaveBeenNthCalledWith(1, {
      where: {
        OR: [
          {
            scheduledDate: {
              gte: new Date('2026-10-19T22:00:00.000Z'),
              lt: new Date('2026-10-20T22:00:00.000Z'),
            },
          },
          {
            publishedAt: {
              gte: new Date('2026-10-19T22:00:00.000Z'),
              lt: new Date('2026-10-20T22:00:00.000Z'),
            },
            scheduledDate: null,
          },
        ],
        brandId: 'brand-1',
        id: { not: 'post-1' },
        isDeleted: false,
        organizationId: 'org-1',
        parentId: null,
        targetExecutionState: {
          in: [
            TargetExecutionState.SCHEDULED,
            TargetExecutionState.PUBLISHING,
            TargetExecutionState.PUBLISHED,
          ],
        },
      },
    });
    expect(evaluateBrandPublishPolicyRules(input)).toEqual([
      expect.objectContaining({ rule: 'daily_cap' }),
    ]);
  });

  it('does not count posts when the Policy sets no cap', async () => {
    await makeService(db).buildEvaluation(FACTS, { isJudgeEnabled: false });

    expect(db.post.count).not.toHaveBeenCalled();
  });

  it('clamps the quality score into the Policy range', async () => {
    const service = makeService(db);

    const high = await service.buildEvaluation(
      { ...FACTS, qualityScore: 140 },
      { isJudgeEnabled: false },
    );
    const missing = await service.buildEvaluation(
      { ...FACTS, qualityScore: Number.NaN },
      { isJudgeEnabled: false },
    );

    expect(high.draft.qualityScore).toBe(100);
    expect(missing.draft.qualityScore).toBeNull();
  });

  it('judges an unreadable schedule as a publish now', async () => {
    const input = await makeService(db).buildEvaluation(
      { ...FACTS, publishAt: new Date('not a date') },
      { isJudgeEnabled: false },
    );

    expect(Number.isNaN(Date.parse(input.draft.publishAt))).toBe(false);
  });

  it('records violations with a tenant-scoped raw write that leaves updatedAt alone', async () => {
    const violations: IBrandPolicyViolation[] = [
      { detail: 'Video is always reviewed.', rule: 'video_always_reviewed' },
    ];

    await makeService(db).recordViolations('org-1', 'post-1', violations);

    const [strings, ...values] = db.$executeRaw.mock.calls[0] ?? [];
    const sql = (strings as readonly string[]).join('?');
    expect(sql).toContain('UPDATE "posts" SET "policyViolations"');
    expect(sql).toContain('"organizationId" = ?');
    expect(sql).toContain('"isDeleted" = false');
    expect(sql).not.toContain('updatedAt');
    expect(values).toEqual([
      JSON.stringify(violations),
      'post-1',
      'org-1',
      JSON.stringify(violations),
    ]);
  });

  it('describes a saved post from its live media, receipt and schedule', async () => {
    db.post.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      brandedReceiptState: 'ready',
      category: PostCategory.TEXT,
      description: 'Caption',
      ingredientLinks: [{ ingredient: { category: 'IMAGE' } }],
      platform: 'twitter',
      scheduledDate: FACTS.publishAt,
    });

    await expect(
      makeService(db).describePost('org-1', 'post-1'),
    ).resolves.toEqual({
      brandId: 'brand-1',
      format: 'image',
      organizationId: 'org-1',
      passedChecks: ['brand_validation', 'fact_check'],
      platform: 'twitter',
      postId: 'post-1',
      publishAt: FACTS.publishAt,
      text: 'Caption',
    });
    expect(db.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'post-1', isDeleted: false, organizationId: 'org-1' },
      }),
    );
  });

  it('reads ingredient categories within the tenant', async () => {
    await expect(
      makeService(db).readIngredientCategories('org-1', ['a-1']),
    ).resolves.toEqual(['VIDEO']);
    expect(db.ingredient.findMany).toHaveBeenCalledWith({
      select: { category: true },
      where: { id: { in: ['a-1'] }, isDeleted: false, organizationId: 'org-1' },
    });
    await expect(
      makeService(db).readIngredientCategories('org-1', []),
    ).resolves.toEqual([]);
    expect(db.ingredient.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('BrandPublishPolicyService post cap lock (#7458)', () => {
  const CAPPED: IBrandPublishPolicy = {
    ...createDefaultBrandPublishPolicy(),
    maxPostsPerDay: 2,
    maxPostsPerWeek: 5,
  };
  const SCOPE = { brandId: 'brand-1', organizationId: 'org-1' };
  const LOCK_KEY = 'brand-publish-cap:v1:org-1:brand-1';

  function makeCappedDb(policy: IBrandPublishPolicy = CAPPED) {
    const db = makeDb(policy);
    const tx = makeDb(policy);
    tx.$queryRaw.mockResolvedValue([{ isLocked: true }]);
    db.$transaction.mockImplementation(
      async (work: (client: unknown) => Promise<unknown>) => work(tx),
    );
    return { db, tx };
  }

  it('locks the brand before counting inside a transaction', async () => {
    const { db, tx } = makeCappedDb();

    await makeService(db).buildEvaluation(
      FACTS,
      { isJudgeEnabled: false },
      tx as unknown as Prisma.TransactionClient,
    );

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.calls[0]?.slice(1)).toEqual([LOCK_KEY]);
    expect(String(tx.$queryRaw.mock.calls[0]?.[0])).toContain(
      'pg_advisory_xact_lock',
    );
    expect(tx.post.count).toHaveBeenCalledTimes(2);
    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0] ?? Infinity;
    for (const countOrder of tx.post.count.mock.invocationCallOrder)
      expect(lockOrder).toBeLessThan(countOrder);
  });

  it('locks when only one of the caps is set', async () => {
    const { db, tx } = makeCappedDb({
      ...createDefaultBrandPublishPolicy(),
      maxPostsPerWeek: 5,
    });

    await makeService(db).buildEvaluation(
      FACTS,
      { isJudgeEnabled: false },
      tx as unknown as Prisma.TransactionClient,
    );

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.post.count).toHaveBeenCalledTimes(1);
  });

  it('takes no lock when the Policy sets no caps', async () => {
    const { db, tx } = makeCappedDb(createDefaultBrandPublishPolicy());

    await makeService(db).buildEvaluation(
      FACTS,
      { isJudgeEnabled: false },
      tx as unknown as Prisma.TransactionClient,
    );

    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.post.count).not.toHaveBeenCalled();
  });

  it('takes no lock outside a transaction, where an evaluation only previews', async () => {
    const { db } = makeCappedDb();

    await makeService(db).buildEvaluation(FACTS, { isJudgeEnabled: false });

    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(db.post.count).toHaveBeenCalledTimes(2);
  });

  it('runs the work under a lock-only transaction and tells it the lock is held', async () => {
    const { db, tx } = makeCappedDb();
    const work = vi.fn(async (isLocked: boolean) => {
      // The lock is already taken when the work starts.
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      return isLocked ? 'locked' : 'unlocked';
    });

    const result = await makeService(db).withPostCapLock(SCOPE, work);

    expect(result).toBe('locked');
    expect(work).toHaveBeenCalledWith(true);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 30000,
    });
    expect(tx.$queryRaw.mock.calls[0]?.slice(1)).toEqual([LOCK_KEY]);
    expect(db.brandOsRevision.findFirst).toHaveBeenCalledWith({
      select: { content: true },
      where: {
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
        status: 'APPROVED',
      },
    });
  });

  it('runs the work without a transaction for a brand without caps', async () => {
    const { db, tx } = makeCappedDb(createDefaultBrandPublishPolicy());
    const work = vi.fn(async (isLocked: boolean) => isLocked);

    expect(await makeService(db).withPostCapLock(SCOPE, work)).toBe(false);

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('runs the work without a transaction for a publish with no brand', async () => {
    const { db } = makeCappedDb();

    await makeService(db).withPostCapLock(
      { brandId: '', organizationId: 'org-1' },
      async () => undefined,
    );

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.brandOsRevision.findFirst).not.toHaveBeenCalled();
  });

  it('does not lock again for a nested check in the same flow', async () => {
    const { db, tx } = makeCappedDb();
    const service = makeService(db);

    await service.withPostCapLock(SCOPE, async () => {
      // A check in another transaction of the flow would otherwise wait on
      // the lock the flow already holds.
      await service.buildEvaluation(
        FACTS,
        { isJudgeEnabled: false },
        makeDb(CAPPED) as unknown as Prisma.TransactionClient,
      );
      const nested = await service.withPostCapLock(
        SCOPE,
        async (locked) => locked,
      );
      expect(nested).toBe(true);
    });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('locks another brand nested in the flow, and forgets the lock afterwards', async () => {
    const { db, tx } = makeCappedDb();
    const service = makeService(db);

    await service.withPostCapLock(SCOPE, async () => {
      await service.withPostCapLock(
        { brandId: 'brand-2', organizationId: 'org-1' },
        async () => undefined,
      );
    });
    await service.withPostCapLock(SCOPE, async () => undefined);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it('waits for a held lock without keeping a transaction open', async () => {
    const { db, tx } = makeCappedDb();
    tx.$queryRaw.mockResolvedValueOnce([{ isLocked: false }]);
    const work = vi.fn(async (isLocked: boolean) => isLocked);

    expect(await makeService(db).withPostCapLock(SCOPE, work)).toBe(true);

    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(String(tx.$queryRaw.mock.calls[0]?.[0])).toContain(
      'pg_try_advisory_xact_lock',
    );
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('lets a failed write roll the lock transaction back', async () => {
    const { db } = makeCappedDb();

    await expect(
      makeService(db).withPostCapLock(SCOPE, async () => {
        throw new Error('post write failed');
      }),
    ).rejects.toThrow('post write failed');
  });
});
