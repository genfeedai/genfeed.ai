import {
  buildCursorWhere,
  buildPatternPayloads,
  classifyAdRow,
  classifyContentRow,
  classifyCta,
  classifyHook,
  deserializeGroups,
  isInsertSinceCheckpoint,
  mergeClassifiedRecords,
  serializeGroups,
} from '@workers/processors/api/queues/pattern-extraction/pattern-extraction.logic';
import type {
  AdPerformanceScanRow,
  ClassifiedRecord,
  PatternGroupState,
} from '@workers/processors/api/queues/pattern-extraction/pattern-extraction.types';
import { describe, expect, it } from 'vitest';

function adRow(
  id: string,
  orgId: string,
  data: Record<string, unknown>,
  extras: Partial<AdPerformanceScanRow> = {},
): AdPerformanceScanRow {
  const at = extras.createdAt ?? new Date('2026-08-01T00:00:00.000Z');
  return {
    adPlatform: extras.adPlatform ?? (data.adPlatform as string | undefined),
    createdAt: at,
    ctaText: extras.ctaText ?? (data.ctaText as string | undefined),
    data,
    headlineText:
      extras.headlineText ?? (data.headlineText as string | undefined),
    id,
    industry: extras.industry ?? (data.industry as string | undefined),
    organizationId: orgId,
    performanceScore:
      extras.performanceScore ?? (data.performanceScore as number | undefined),
    updatedAt: extras.updatedAt ?? at,
  };
}

function summarize(payloads: ReturnType<typeof buildPatternPayloads>) {
  return payloads
    .map((payload) => ({
      avgPerformanceScore: payload.avgPerformanceScore,
      exampleTexts: payload.examples.map((example) => example.text).sort(),
      formula: payload.formula,
      industry: payload.industry ?? '',
      organization: payload.organization ?? '',
      patternType: payload.patternType,
      platform: payload.platform ?? '',
      sampleSize: payload.sampleSize,
      scope: payload.scope,
      source: payload.source,
    }))
    .sort((left, right) =>
      `${left.scope}|${left.platform}|${left.formula}|${left.organization}`.localeCompare(
        `${right.scope}|${right.platform}|${right.formula}|${right.organization}`,
      ),
    );
}

function collectFromAds(
  rows: AdPerformanceScanRow[],
  cursor: { measuredAt: Date; sourceId: string } | null = null,
): Map<string, PatternGroupState> {
  const groups = new Map<string, PatternGroupState>();
  for (const row of rows) {
    mergeClassifiedRecords(groups, classifyAdRow(row, cursor));
  }
  return groups;
}

describe('pattern extraction classification', () => {
  it('classifies hook, cta, and structure variants', () => {
    expect(classifyHook('Did you know this trick?')).toBe('question_hook');
    expect(classifyHook('Grew 10x in a month')).toBe('stat_hook');
    expect(classifyHook('Stop making this mistake')).toBe(
      'pattern_interrupt_hook',
    );
    expect(classifyHook('She went from zero to hero')).toBe(
      'transformation_hook',
    );
    expect(classifyCta('Limited time offer ends today')).toBe('urgency_cta');
    expect(classifyCta('Free forever plan available')).toBe('free_offer_cta');
    expect(classifyCta('Ready to level up your content?')).toBe('question_cta');
  });

  it('skips records below the performance threshold', () => {
    const classified = classifyAdRow(
      adRow('ad-1', 'org-1', {
        adPlatform: 'facebook',
        headlineText: 'Low performer',
        performanceScore: 40,
      }),
      null,
    );
    expect(classified).toEqual([]);
  });

  it('prefers scalar columns and falls back to JSON data', () => {
    const fromColumns = classifyAdRow(
      adRow(
        'ad-1',
        'org-1',
        {},
        {
          adPlatform: 'tiktok',
          headlineText: 'How do columns work?',
          performanceScore: 91,
        },
      ),
      null,
    );
    const fromJson = classifyAdRow(
      adRow('ad-2', 'org-1', {
        adPlatform: 'tiktok',
        headlineText: 'How do columns work?',
        performanceScore: 91,
      }),
      null,
    );
    expect(fromColumns[0]?.classifiedType).toBe('question_hook');
    expect(fromJson[0]?.classifiedType).toBe('question_hook');
  });
});

describe('pattern extraction fixture corpus', () => {
  const now = new Date('2026-08-12T02:00:00.000Z');

  it('matches the private single-org corpus', () => {
    const groups = collectFromAds([
      adRow('ad-1', 'org-1', {
        adPlatform: 'facebook',
        bodyText: '1. First point in a numbered list of things',
        ctaText: 'Buy now before the deal ends',
        headlineText: 'Did you know this trick?',
        industry: 'saas',
        performanceScore: 90,
      }),
    ]);
    const payloads = buildPatternPayloads(groups.values(), now);
    expect(payloads).toHaveLength(3);
    for (const payload of payloads) {
      expect(payload.scope).toBe('private');
      expect(payload.organization).toBe('org-1');
      expect(payload.industry).toBe('saas');
      expect(payload.sampleSize).toBe(1);
    }
    expect(payloads.map((payload) => payload.patternType).sort()).toEqual([
      'content_structure',
      'cta_formula',
      'hook_formula',
    ]);
  });

  it('matches the public five-org question-hook corpus', () => {
    const groups = collectFromAds(
      ['org-1', 'org-2', 'org-3', 'org-4', 'org-5'].map((orgId, index) =>
        adRow(`ad-${index}`, orgId, {
          adPlatform: 'facebook',
          headlineText: `Did you try variant ${index}?`,
          performanceScore: 80 + index,
        }),
      ),
    );
    const payloads = buildPatternPayloads(groups.values(), now);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.scope).toBe('public');
    expect(payloads[0]?.formula).toBe('question_hook');
    expect(payloads[0]?.sampleSize).toBe(5);
    expect(payloads[0]?.avgPerformanceScore).toBe(82);
    expect(payloads[0]?.examples).toHaveLength(3);
    expect(payloads[0]?.examples.map((example) => example.score)).toEqual([
      84, 83, 82,
    ]);
  });

  it('classifies organic content records', () => {
    const groups = new Map<string, PatternGroupState>();
    mergeClassifiedRecords(
      groups,
      classifyContentRow(
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
        null,
      ),
    );
    const payloads = buildPatternPayloads(groups.values(), now);
    expect(payloads.map((payload) => payload.patternType).sort()).toEqual([
      'content_structure',
      'hook_formula',
    ]);
    for (const payload of payloads) {
      expect(payload.source).toBe('organic');
      expect(payload.scope).toBe('private');
      expect(payload.organization).toBe('org-9');
    }
  });

  it('keeps incremental pages equivalent to a full corpus scan', () => {
    const rows = [
      adRow(
        'ad-1',
        'org-1',
        {
          adPlatform: 'facebook',
          headlineText: 'Did you try variant 0?',
          performanceScore: 80,
        },
        { createdAt: new Date('2026-08-01T00:00:00.000Z') },
      ),
      adRow(
        'ad-2',
        'org-2',
        {
          adPlatform: 'facebook',
          headlineText: 'Did you try variant 1?',
          performanceScore: 81,
        },
        { createdAt: new Date('2026-08-02T00:00:00.000Z') },
      ),
      adRow(
        'ad-3',
        'org-3',
        {
          adPlatform: 'facebook',
          headlineText: 'Did you try variant 2?',
          performanceScore: 82,
        },
        { createdAt: new Date('2026-08-03T00:00:00.000Z') },
      ),
      adRow(
        'ad-4',
        'org-4',
        {
          adPlatform: 'facebook',
          headlineText: 'Did you try variant 3?',
          performanceScore: 83,
        },
        { createdAt: new Date('2026-08-04T00:00:00.000Z') },
      ),
      adRow(
        'ad-5',
        'org-5',
        {
          adPlatform: 'facebook',
          headlineText: 'Did you try variant 4?',
          performanceScore: 84,
        },
        { createdAt: new Date('2026-08-05T00:00:00.000Z') },
      ),
    ];

    const full = buildPatternPayloads(collectFromAds(rows).values(), now);
    const firstPage = collectFromAds(rows.slice(0, 2));
    const firstCursor = {
      measuredAt: rows[1]?.updatedAt ?? new Date(0),
      sourceId: rows[1]?.id ?? '',
    };
    mergeClassifiedRecords(
      firstPage,
      rows.slice(2).flatMap((row) => classifyAdRow(row, firstCursor)),
    );
    const incremental = buildPatternPayloads(firstPage.values(), now);

    expect(summarize(incremental)).toEqual(summarize(full));
    expect(
      serializeGroups(deserializeGroups(serializeGroups(firstPage))),
    ).toEqual(serializeGroups(firstPage));
  });

  it('does not double-count an updated row after the checkpoint', () => {
    const createdAt = new Date('2026-08-01T00:00:00.000Z');
    const first = classifyAdRow(
      adRow(
        'ad-1',
        'org-1',
        {
          adPlatform: 'tiktok',
          headlineText: 'Did this work the first time?',
          performanceScore: 90,
        },
        { createdAt, updatedAt: createdAt },
      ),
      null,
    );
    const groups = new Map<string, PatternGroupState>();
    mergeClassifiedRecords(groups, first);
    const updated: ClassifiedRecord[] = classifyAdRow(
      adRow(
        'ad-1',
        'org-1',
        {
          adPlatform: 'tiktok',
          headlineText: 'Did this work the first time?',
          performanceScore: 99,
        },
        { createdAt, updatedAt: new Date('2026-08-03T00:00:00.000Z') },
      ),
      { measuredAt: createdAt, sourceId: 'ad-1' },
    );
    mergeClassifiedRecords(groups, updated);
    const [group] = [...groups.values()];
    expect(group?.sampleSize).toBe(1);
    expect(group?.examples[0]?.score).toBe(99);
  });
});

describe('pattern extraction checkpoint helpers', () => {
  it('builds a keyset where on (updatedAt, id)', () => {
    const measuredAt = new Date('2026-08-10T00:00:00.000Z');
    expect(buildCursorWhere(null)).toEqual({});
    expect(buildCursorWhere({ measuredAt, sourceId: 'ad-9' })).toEqual({
      OR: [
        { updatedAt: { gt: measuredAt } },
        { id: { gt: 'ad-9' }, updatedAt: measuredAt },
      ],
    });
  });

  it('treats rows created after the cursor as inserts', () => {
    const cursor = {
      measuredAt: new Date('2026-08-02T00:00:00.000Z'),
      sourceId: 'ad-2',
    };
    expect(
      isInsertSinceCheckpoint(
        new Date('2026-08-03T00:00:00.000Z'),
        'ad-3',
        cursor,
      ),
    ).toBe(true);
    expect(
      isInsertSinceCheckpoint(
        new Date('2026-08-01T00:00:00.000Z'),
        'ad-1',
        cursor,
      ),
    ).toBe(false);
  });
});
