import type { PatternExtractionJobData } from '@genfeedai/queue-contracts';
import { PatternExtractionProcessor } from '@workers/processors/api/queues/pattern-extraction/pattern-extraction.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface AdRow {
  data: Record<string, unknown>;
  organizationId: string;
}

function buildJob(platform: string): Job<PatternExtractionJobData> {
  return {
    data: { platform },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<PatternExtractionJobData>;
}

function adRow(orgId: string, data: Record<string, unknown>): AdRow {
  return { data, organizationId: orgId };
}

describe('PatternExtractionProcessor', () => {
  let processor: PatternExtractionProcessor;
  let prisma: {
    adPerformance: { findMany: ReturnType<typeof vi.fn> };
    contentPerformance: { findMany: ReturnType<typeof vi.fn> };
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

  it('queries soft-delete-scoped performance records', async () => {
    const job = buildJob('all');

    await processor.process(job);

    expect(prisma.adPerformance.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false },
    });
    expect(prisma.contentPerformance.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false },
    });
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('skips records below the performance threshold and other platforms', async () => {
    prisma.adPerformance.findMany.mockResolvedValue([
      adRow('org-1', {
        adPlatform: 'facebook',
        headlineText: 'Low performer',
        performanceScore: 40,
      }),
      adRow('org-1', {
        adPlatform: 'tiktok',
        headlineText: 'Wrong platform',
        performanceScore: 95,
      }),
    ]);
    prisma.contentPerformance.findMany.mockResolvedValue([
      {
        data: { hookUsed: 'Meh', performanceScore: 10, platform: 'facebook' },
        organizationId: 'org-1',
      },
      {
        data: { hookUsed: 'Nope', performanceScore: 95, platform: 'tiktok' },
        organizationId: 'org-1',
      },
    ]);

    await processor.process(buildJob('facebook'));

    expect(creativePatternsService.upsertPattern).not.toHaveBeenCalled();
  });

  it('upserts a private pattern when a single org owns the group', async () => {
    prisma.adPerformance.findMany.mockResolvedValue([
      adRow('org-1', {
        adPlatform: 'facebook',
        bodyText: '1. First point in a numbered list of things',
        ctaText: 'Buy now before the deal ends',
        headlineText: 'Did you know this trick?',
        industry: 'saas',
        performanceScore: 90,
      }),
    ]);

    await processor.process(buildJob('all'));

    // hook_formula + cta_formula + content_structure — one private pattern each
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
        adRow(orgId, {
          adPlatform: 'facebook',
          headlineText: `Did you try variant ${index}?`,
          performanceScore: 80 + index,
        }),
      ),
    );

    await processor.process(buildJob('facebook'));

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
      adRow('org-1', {
        adPlatform: 'tiktok',
        headlineText: 'Grew 10x in a month',
        performanceScore: 91,
      }),
      adRow('org-1', {
        adPlatform: 'tiktok',
        headlineText: 'Stop making this mistake',
        performanceScore: 92,
      }),
      adRow('org-1', {
        adPlatform: 'tiktok',
        headlineText: 'She went from zero to hero',
        performanceScore: 93,
      }),
      adRow('org-1', {
        adPlatform: 'tiktok',
        headlineText: 'A quiet story about our founder',
        performanceScore: 94,
      }),
      adRow('org-1', {
        adPlatform: 'tiktok',
        ctaText: 'Limited time offer ends today',
        performanceScore: 95,
      }),
      adRow('org-1', {
        adPlatform: 'tiktok',
        ctaText: 'Free forever plan available',
        performanceScore: 96,
      }),
      adRow('org-1', {
        adPlatform: 'tiktok',
        ctaText: 'Ready to level up your content?',
        performanceScore: 97,
      }),
      adRow('org-1', {
        adPlatform: 'tiktok',
        ctaText: 'Learn more whenever it suits',
        performanceScore: 98,
      }),
      adRow('org-1', {
        adPlatform: 'tiktok',
        bodyText: 'Short punch',
        performanceScore: 90,
      }),
      adRow('org-1', {
        adPlatform: 'tiktok',
        bodyText: `What makes this work? ${'x'.repeat(30)}`,
        performanceScore: 90,
      }),
      adRow('org-1', {
        adPlatform: 'tiktok',
        bodyText: 'y'.repeat(300),
        performanceScore: 90,
      }),
      adRow('org-1', {
        adPlatform: 'tiktok',
        bodyText: `A standard mid-length body copy. ${'z'.repeat(40)}`,
        performanceScore: 90,
      }),
    ]);

    await processor.process(buildJob('all'));

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
        data: {
          hookUsed: 'How do you scale content?',
          performanceScore: 90,
          platform: 'instagram',
          promptUsed: `A long form story prompt. ${'p'.repeat(300)}`,
        },
        organizationId: 'org-9',
      },
    ]);

    await processor.process(buildJob('instagram'));

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

  it('logs and continues when an upsert fails', async () => {
    creativePatternsService.upsertPattern.mockRejectedValue(
      new Error('db down'),
    );
    prisma.adPerformance.findMany.mockResolvedValue([
      adRow('org-1', {
        adPlatform: 'facebook',
        headlineText: 'Why does this work so well?',
        performanceScore: 90,
      }),
    ]);

    const job = buildJob('all');
    await processor.process(job);

    expect(logger.error).toHaveBeenCalled();
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('logs a public upsert failure without aborting the run', async () => {
    creativePatternsService.upsertPattern.mockRejectedValue(
      new Error('db down'),
    );
    prisma.adPerformance.findMany.mockResolvedValue(
      ['org-1', 'org-2', 'org-3', 'org-4', 'org-5'].map((orgId) =>
        adRow(orgId, {
          adPlatform: 'facebook',
          headlineText: 'Why does this work?',
          performanceScore: 90,
        }),
      ),
    );

    const job = buildJob('all');
    await processor.process(job);

    expect(logger.error).toHaveBeenCalled();
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('rethrows when the performance query fails', async () => {
    prisma.adPerformance.findMany.mockRejectedValue(new Error('boom'));

    await expect(processor.process(buildJob('all'))).rejects.toThrow('boom');
    expect(logger.error).toHaveBeenCalled();
  });
});
