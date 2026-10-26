import {
  buildLearningPromptSlotOutcomeReport,
  LEARNING_PROMPT_SLOT_POST_LIMIT,
  LearningPromptSlotOutcomeService,
  type LearningSlotOutcomePostRow,
} from '@api/collections/content-learning/services/learning-prompt-slot-outcome.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

type PromptRow = NonNullable<
  LearningSlotOutcomePostRow['ingredientLinks'][number]['ingredient']['prompt']
>;

function prompt(overrides: Partial<PromptRow> = {}): PromptRow {
  return {
    action: null,
    blacklists: [],
    camera: null,
    cameraMovement: null,
    isDeleted: false,
    lens: null,
    lighting: null,
    mood: null,
    scene: null,
    sounds: [],
    speech: null,
    style: null,
    subject: null,
    ...overrides,
  };
}

function post(
  id: string,
  options: {
    category?: 'IMAGE' | 'VIDEO';
    composite?: number | null;
    objective?: string | null;
    prompts?: Array<PromptRow | null>;
    status?: string;
    hasDecision?: boolean;
  } = {},
): LearningSlotOutcomePostRow {
  const {
    category = 'IMAGE',
    composite = 0.1,
    objective = 'engagement',
    prompts = [prompt({ lighting: 'golden hour' })],
    status = 'valid',
    hasDecision = true,
  } = options;
  return {
    id,
    ingredientLinks: prompts.map((value) => ({
      ingredient: { category, isDeleted: false, prompt: value },
    })),
    learningDecision: hasDecision
      ? {
          rewards: [
            {
              composite,
              confidence: objective ? { objective } : {},
              status,
            },
          ],
        }
      : null,
  } as LearningSlotOutcomePostRow;
}

describe('buildLearningPromptSlotOutcomeReport', () => {
  it('groups posts by media category and objective and compares their slots', () => {
    const posts = [
      ...Array.from({ length: 25 }, (_, index) =>
        post(`img-lit-${index}`, {
          composite: 0.5,
          prompts: [prompt({ lighting: 'golden hour' })],
        }),
      ),
      ...Array.from({ length: 25 }, (_, index) =>
        post(`img-plain-${index}`, {
          composite: -0.2,
          prompts: [prompt({ subject: 'a runner' })],
        }),
      ),
      post('video-1', {
        category: 'VIDEO',
        objective: 'retention-watch',
        prompts: [prompt({ action: 'jumps' })],
      }),
    ];

    const report = buildLearningPromptSlotOutcomeReport(
      ['org-1'],
      posts,
      false,
    );

    expect(report.postCount).toBe(51);
    expect(
      report.groups.map((g) => [g.category, g.objective, g.postCount]),
    ).toEqual([
      ['IMAGE', 'engagement', 50],
      ['VIDEO', 'retention-watch', 1],
    ]);
    const lighting = report.groups[0].comparison.comparisons.find(
      (comparison) =>
        comparison.slot === 'lighting' && comparison.value === null,
    );
    expect(lighting?.verdict).toBe('better');
    expect(
      report.groups[1].comparison.comparisons.every(
        (comparison) => comparison.verdict === 'insufficient_data',
      ),
    ).toBe(true);
  });

  it('is reproducible for the same posts', () => {
    const posts = Array.from({ length: 40 }, (_, index) =>
      post(`p-${index}`, {
        composite: index % 2 ? 0.4 : -0.1,
        prompts: [prompt(index % 3 ? { mood: 'calm' } : { style: 'film' })],
      }),
    );
    expect(
      buildLearningPromptSlotOutcomeReport(['org-1'], posts, false),
    ).toEqual(buildLearningPromptSlotOutcomeReport(['org-1'], posts, false));
  });

  it('counts, rather than guesses, posts it cannot use', () => {
    const report = buildLearningPromptSlotOutcomeReport(
      ['org-1'],
      [
        post('no-decision', { hasDecision: false }),
        post('invalid', { status: 'censored', composite: null }),
        post('no-objective', { objective: null }),
        post('no-prompt', { prompts: [null] }),
        post('deleted-prompt', {
          prompts: [prompt({ isDeleted: true, mood: 'x' })],
        }),
        post('legacy', { prompts: [prompt()] }),
        post('usable'),
      ],
      true,
    );

    expect(report.skipped).toEqual({
      noPrompt: 2,
      noSlots: 1,
      noValidReward: 3,
    });
    expect(report.groups.map((g) => g.postCount)).toEqual([1]);
    expect(report.isTruncated).toBe(true);
  });

  it('reads the lead prompt of a carousel and maps blacklists to avoid', () => {
    const report = buildLearningPromptSlotOutcomeReport(
      ['org-1'],
      [
        post('carousel', {
          prompts: [
            prompt({ blacklists: ['text'] }),
            prompt({ lighting: 'neon' }),
          ],
        }),
      ],
      false,
    );
    const filled = (slot: string) =>
      report.groups[0].comparison.comparisons.find(
        (comparison) => comparison.slot === slot && comparison.value === null,
      )?.filled.count;
    expect(filled('avoid')).toBe(1);
    expect(filled('lighting')).toBe(0);
  });
});

describe('LearningPromptSlotOutcomeService', () => {
  function build(rows: LearningSlotOutcomePostRow[]) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const service = new LearningPromptSlotOutcomeService({
      post: { findMany },
    } as unknown as PrismaService);
    return { findMany, service };
  }

  it('reads only the requested organization, undeleted posts and real decisions', async () => {
    const { findMany, service } = build([post('p1')]);

    const report = await service.report({
      brandId: 'brand-1',
      credentialId: 'cred-1',
      organizationIds: ['org-1'],
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: LEARNING_PROMPT_SLOT_POST_LIMIT + 1,
        where: expect.objectContaining({
          brandId: 'brand-1',
          credentialId: 'cred-1',
          isDeleted: false,
          learningDecision: {
            is: { isDeleted: false, organizationId: 'org-1', synthetic: false },
          },
          organizationId: 'org-1',
        }),
      }),
    );
    expect(report.organizationIds).toEqual(['org-1']);
    expect(report.isPooled).toBe(false);
    expect(report.isTruncated).toBe(false);
  });

  it('says so when more posts exist than it reads', async () => {
    const rows = Array.from(
      { length: LEARNING_PROMPT_SLOT_POST_LIMIT + 1 },
      (_, i) => post(`p-${i}`),
    );
    const { service } = build(rows);

    const report = await service.report({ organizationIds: ['org-1'] });

    expect(report.isTruncated).toBe(true);
    expect(report.postCount).toBe(LEARNING_PROMPT_SLOT_POST_LIMIT);
  });

  it('reads each pooled organization with its own tenant filter and merges the rows', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([post('a-1'), post('a-2')])
      .mockResolvedValueOnce([post('b-1')]);
    const service = new LearningPromptSlotOutcomeService({
      post: { findMany },
    } as unknown as PrismaService);

    const report = await service.report({
      organizationIds: ['org-a', 'org-b'],
    });

    expect(findMany).toHaveBeenCalledTimes(2);
    const scopes = findMany.mock.calls.map(
      ([args]) => args.where.learningDecision.is.organizationId,
    );
    expect(scopes).toEqual(['org-a', 'org-b']);
    for (const [args] of findMany.mock.calls) {
      expect(args.where.organizationId).toBe(
        args.where.learningDecision.is.organizationId,
      );
      expect(args.where.isDeleted).toBe(false);
    }
    expect(report.isPooled).toBe(true);
    expect(report.organizationIds).toEqual(['org-a', 'org-b']);
    expect(report.postCount).toBe(3);
  });

  it('flags truncation when any pooled organization hit the limit', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([post('a-1')])
      .mockResolvedValueOnce(
        Array.from({ length: LEARNING_PROMPT_SLOT_POST_LIMIT + 1 }, (_, i) =>
          post(`b-${i}`),
        ),
      );
    const service = new LearningPromptSlotOutcomeService({
      post: { findMany },
    } as unknown as PrismaService);

    const report = await service.report({ organizationIds: ['a', 'b'] });

    expect(report.isTruncated).toBe(true);
    expect(report.postCount).toBe(LEARNING_PROMPT_SLOT_POST_LIMIT + 1);
  });

  it('seeds a pooled report from the sorted organizations so order does not change it', () => {
    const posts = Array.from({ length: 40 }, (_, index) =>
      post(`p-${index}`, {
        composite: index % 2 ? 0.4 : -0.1,
        prompts: [prompt(index % 3 ? { mood: 'calm' } : { style: 'film' })],
      }),
    );
    expect(
      buildLearningPromptSlotOutcomeReport(['b', 'a'], posts, false).groups,
    ).toEqual(
      buildLearningPromptSlotOutcomeReport(['a', 'b'], posts, false).groups,
    );
  });
});
