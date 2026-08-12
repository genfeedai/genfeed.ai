import type { PatternExtractionJobData } from '@genfeedai/queue-contracts';
import { PATTERN_EXTRACTION_PAGE_SIZE } from '@workers/processors/api/queues/pattern-extraction/pattern-extraction.constants';
import { PatternExtractionProcessor } from '@workers/processors/api/queues/pattern-extraction/pattern-extraction.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface AdRow {
  adPlatform?: string;
  createdAt: Date;
  ctaText?: string;
  data: Record<string, unknown>;
  headlineText?: string;
  id: string;
  industry?: string;
  organizationId: string;
  performanceScore?: number;
  updatedAt: Date;
}

function buildJob(): Job<PatternExtractionJobData> {
  return {
    data: {},
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<PatternExtractionJobData>;
}

function adRow(
  id: string,
  orgId: string,
  data: Record<string, unknown>,
  at = new Date('2026-08-01T00:00:00.000Z'),
): AdRow {
  return {
    adPlatform: data.adPlatform as string | undefined,
    createdAt: at,
    ctaText: data.ctaText as string | undefined,
    data,
    headlineText: data.headlineText as string | undefined,
    id,
    industry: data.industry as string | undefined,
    organizationId: orgId,
    performanceScore: data.performanceScore as number | undefined,
    updatedAt: at,
  };
}

describe('PatternExtractionProcessor', () => {
  let processor: PatternExtractionProcessor;
  let prisma: {
    adPerformance: { findMany: ReturnType<typeof vi.fn> };
    contentPerformance: { findMany: ReturnType<typeof vi.fn> };
    patternExtractionCheckpoint: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  };
  let creativePatternsService: { upsertPattern: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prisma = {
      adPerformance: { findMany: vi.fn().mockResolvedValue([]) },
      contentPerformance: { findMany: vi.fn().mockResolvedValue([]) },
      patternExtractionCheckpoint: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    creativePatternsService = {
      upsertPattern: vi.fn().mockResolvedValue(undefined),
    };
    logger = { error: vi.fn(), log: vi.fn() };

    processor = new PatternExtractionProcessor(
      prisma as never,
      creativePatternsService as never,
      logger as never,
    );
  });

  it('keyset-pages performance rows instead of an unbounded findMany', async () => {
    const job = buildJob();

    await processor.process(job);

    expect(prisma.adPerformance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: PATTERN_EXTRACTION_PAGE_SIZE,
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ isDeleted: false }]),
        }),
      }),
    );
    expect(prisma.contentPerformance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: PATTERN_EXTRACTION_PAGE_SIZE,
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ isDeleted: false }]),
        }),
      }),
    );
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('skips records below the performance threshold and does not filter by job platform', async () => {
    prisma.adPerformance.findMany.mockResolvedValue([
      adRow('ad-low', 'org-1', {
        adPlatform: 'facebook',
        headlineText: 'Low performer',
        performanceScore: 40,
      }),
      adRow('ad-tiktok', 'org-1', {
        adPlatform: 'tiktok',
        headlineText: 'How does one scan derive every platform?',
        performanceScore: 95,
      }),
    ]);

    await processor.process(buildJob());

    expect(creativePatternsService.upsertPattern).toHaveBeenCalledTimes(1);
    const pattern = creativePatternsService.upsertPattern.mock
      .calls[0][0] as Record<string, unknown>;
    expect(pattern.platform).toBe('tiktok');
    expect(pattern.scope).toBe('private');
  });

  it('upserts a private pattern when a single org owns the group', async () => {
    prisma.adPerformance.findMany.mockResolvedValue([
      adRow('ad-1', 'org-1', {
        adPlatform: 'facebook',
        bodyText: '1. First point in a numbered list of things',
        ctaText: 'Buy now before the deal ends',
        headlineText: 'Did you know this trick?',
        industry: 'saas',
        performanceScore: 90,
      }),
    ]);

    await processor.process(buildJob());

    expect(creativePatternsService.upsertPattern).toHaveBeenCalledTimes(3);
    const calls = creativePatternsService.upsertPattern.mock.calls.map(
      (call) => call[0] as Record<string, unknown>,
    );
    for (const pattern of calls) {
      expect(pattern.scope).toBe('private');
      expect(pattern.organization).toBe('org-1');
      expect(pattern.isDeleted).toBe(false);
      expect(pattern.industry).toBe('saas');
      expect(pattern.sampleSize).toBe(1);
    }
    const patternTypes = calls.map((c) => c.patternType).sort();
    expect(patternTypes).toEqual([
      'content_structure',
      'cta_formula',
      'hook_formula',
    ]);
  });

  it('upserts a public pattern once five distinct orgs share a classification', async () => {
    prisma.adPerformance.findMany.mockResolvedValue(
      ['org-1', 'org-2', 'org-3', 'org-4', 'org-5'].map((orgId, index) =>
        adRow(`ad-${index}`, orgId, {
          adPlatform: 'facebook',
          headlineText: `Did you try variant ${index}?`,
          performanceScore: 80 + index,
        }),
      ),
    );

    await processor.process(buildJob());

    expect(creativePatternsService.upsertPattern).toHaveBeenCalledTimes(1);
    const pattern = creativePatternsService.upsertPattern.mock
      .calls[0][0] as Record<string, unknown>;
    expect(pattern.scope).toBe('public');
    expect(pattern.patternType).toBe('hook_formula');
    expect(pattern.formula).toBe('question_hook');
    expect(pattern.sampleSize).toBe(5);
    expect(pattern.avgPerformanceScore).toBe(82);
    expect(Array.isArray(pattern.examples)).toBe(true);
    expect((pattern.examples as unknown[]).length).toBe(3);
  });

  it('classifies hook, cta, and structure variants across records', async () => {
    prisma.adPerformance.findMany.mockResolvedValue([
      adRow('ad-1', 'org-1', {
        adPlatform: 'tiktok',
        headlineText: 'Grew 10x in a month',
        performanceScore: 91,
      }),
      adRow('ad-2', 'org-1', {
        adPlatform: 'tiktok',
        headlineText: 'Stop making this mistake',
        performanceScore: 92,
      }),
      adRow('ad-3', 'org-1', {
        adPlatform: 'tiktok',
        headlineText: 'She went from zero to hero',
        performanceScore: 93,
      }),
      adRow('ad-4', 'org-1', {
        adPlatform: 'tiktok',
        headlineText: 'A quiet story about our founder',
        performanceScore: 94,
      }),
      adRow('ad-5', 'org-1', {
        adPlatform: 'tiktok',
        ctaText: 'Limited time offer ends today',
        performanceScore: 95,
      }),
      adRow('ad-6', 'org-1', {
        adPlatform: 'tiktok',
        ctaText: 'Free forever plan available',
        performanceScore: 96,
      }),
      adRow('ad-7', 'org-1', {
        adPlatform: 'tiktok',
        ctaText: 'Ready to level up your content?',
        performanceScore: 97,
      }),
      adRow('ad-8', 'org-1', {
        adPlatform: 'tiktok',
        ctaText: 'Learn more whenever it suits',
        performanceScore: 98,
      }),
      adRow('ad-9', 'org-1', {
        adPlatform: 'tiktok',
        bodyText: 'Short punch',
        performanceScore: 90,
      }),
      adRow('ad-10', 'org-1', {
        adPlatform: 'tiktok',
        bodyText: `What makes this work? ${'x'.repeat(30)}`,
        performanceScore: 90,
      }),
      adRow('ad-11', 'org-1', {
        adPlatform: 'tiktok',
        bodyText: 'y'.repeat(300),
        performanceScore: 90,
      }),
      adRow('ad-12', 'org-1', {
        adPlatform: 'tiktok',
        bodyText: `A standard mid-length body copy. ${'z'.repeat(40)}`,
        performanceScore: 90,
      }),
    ]);

    await processor.process(buildJob());

    const formulas = creativePatternsService.upsertPattern.mock.calls
      .map((call) => (call[0] as Record<string, unknown>).formula)
      .sort();
    expect(formulas).toEqual(
      [
        'free_offer_cta',
        'narrative_hook',
        'pattern_interrupt_hook',
        'punchy_structure',
        'qa_structure',
        'question_cta',
        'soft_cta',
        'stat_hook',
        'story_structure',
        'standard_structure',
        'transformation_hook',
        'urgency_cta',
      ].sort(),
    );
  });

  it('classifies organic content records into hook and structure patterns', async () => {
    prisma.contentPerformance.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        data: {
          hookUsed: 'How do you scale content?',
          promptUsed: `A long form story prompt. ${'p'.repeat(300)}`,
        },
        id: 'cp-1',
        organizationId: 'org-9',
        performanceScore: 90,
        platform: 'instagram',
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ]);

    await processor.process(buildJob());

    const calls = creativePatternsService.upsertPattern.mock.calls.map(
      (call) => call[0] as Record<string, unknown>,
    );
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.patternType).sort()).toEqual([
      'content_structure',
      'hook_formula',
    ]);
    for (const pattern of calls) {
      expect(pattern.source).toBe('organic');
      expect(pattern.scope).toBe('private');
      expect(pattern.organization).toBe('org-9');
    }
  });

  it('persists a (measuredAt, id) checkpoint after scanning new rows', async () => {
    const updatedAt = new Date('2026-08-08T12:00:00.000Z');
    prisma.adPerformance.findMany.mockResolvedValue([
      adRow(
        'ad-last',
        'org-1',
        {
          adPlatform: 'facebook',
          headlineText: 'Why persist a cursor?',
          performanceScore: 90,
        },
        updatedAt,
      ),
    ]);

    await processor.process(buildJob());

    expect(prisma.patternExtractionCheckpoint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          measuredAt: updatedAt,
          source: 'ad_performance',
          sourceId: 'ad-last',
        }),
        where: { source: 'ad_performance' },
      }),
    );
    expect(prisma.patternExtractionCheckpoint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { source: 'groups' },
      }),
    );
  });

  it('resumes from the stored checkpoint instead of rescanning the corpus', async () => {
    const measuredAt = new Date('2026-08-08T12:00:00.000Z');
    prisma.patternExtractionCheckpoint.findUnique.mockImplementation(
      ({ where }: { where: { source: string } }) => {
        if (where.source === 'ad_performance') {
          return Promise.resolve({
            data: {},
            measuredAt,
            sourceId: 'ad-last',
          });
        }
        return Promise.resolve(null);
      },
    );

    await processor.process(buildJob());

    expect(prisma.adPerformance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: PATTERN_EXTRACTION_PAGE_SIZE,
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { updatedAt: { gt: measuredAt } },
                { id: { gt: 'ad-last' }, updatedAt: measuredAt },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it('pages until a short keyset page arrives', async () => {
    const firstPage = Array.from(
      { length: PATTERN_EXTRACTION_PAGE_SIZE },
      (_, index) =>
        adRow(
          `ad-${index}`,
          'org-1',
          {
            adPlatform: 'facebook',
            headlineText: `Why page ${index}?`,
            performanceScore: 90,
          },
          new Date(Date.UTC(2026, 7, 1, 0, 0, index)),
        ),
    );
    prisma.adPerformance.findMany
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([
        adRow(
          'ad-tail',
          'org-1',
          {
            adPlatform: 'facebook',
            headlineText: 'Why stop after the short page?',
            performanceScore: 91,
          },
          new Date('2026-08-02T00:00:00.000Z'),
        ),
      ]);

    await processor.process(buildJob());

    expect(prisma.adPerformance.findMany).toHaveBeenCalledTimes(2);
  });

  it('logs and continues when an upsert fails', async () => {
    creativePatternsService.upsertPattern.mockRejectedValue(
      new Error('db down'),
    );
    prisma.adPerformance.findMany.mockResolvedValue([
      adRow('ad-1', 'org-1', {
        adPlatform: 'facebook',
        headlineText: 'Why does this work so well?',
        performanceScore: 90,
      }),
    ]);

    const job = buildJob();
    await processor.process(job);

    expect(logger.error).toHaveBeenCalled();
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('logs a public upsert failure without aborting the run', async () => {
    creativePatternsService.upsertPattern.mockRejectedValue(
      new Error('db down'),
    );
    prisma.adPerformance.findMany.mockResolvedValue(
      ['org-1', 'org-2', 'org-3', 'org-4', 'org-5'].map((orgId, index) =>
        adRow(`ad-${index}`, orgId, {
          adPlatform: 'facebook',
          headlineText: 'Why does this work?',
          performanceScore: 90,
        }),
      ),
    );

    const job = buildJob();
    await processor.process(job);

    expect(logger.error).toHaveBeenCalled();
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('rethrows when the performance query fails', async () => {
    prisma.adPerformance.findMany.mockRejectedValue(new Error('boom'));

    await expect(processor.process(buildJob())).rejects.toThrow('boom');
    expect(logger.error).toHaveBeenCalled();
  });
});
