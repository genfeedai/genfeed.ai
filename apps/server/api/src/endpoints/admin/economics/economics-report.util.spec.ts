import {
  buildDailyPoints,
  buildEconomicsTotals,
  buildOperationCoverage,
  EMPTY_ECONOMICS_DAILY_AGGREGATE,
  enumerateWindowDays,
  operationForCreditSource,
  operationForMediaCategory,
  resolveEconomicsWindow,
} from '@api/endpoints/admin/economics/economics-report.util';
import { ActivitySource } from '@genfeedai/contracts';

describe('economics window', () => {
  it('aligns the range to whole UTC days and mirrors it before the start', () => {
    const window = resolveEconomicsWindow({
      from: '2026-09-01',
      to: '2026-09-30',
    });

    expect(window.days).toBe(30);
    expect(window.from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(window.toExclusive.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(window.previousFrom.toISOString()).toBe('2026-08-02T00:00:00.000Z');
  });

  it('counts a timestamp range by the UTC days it touches', () => {
    const window = resolveEconomicsWindow({
      from: '2026-09-01T23:30:00.000Z',
      to: '2026-09-02T00:30:00.000Z',
    });

    expect(window.days).toBe(2);
    expect(enumerateWindowDays(window)).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('defaults to the last 30 days ending now', () => {
    const window = resolveEconomicsWindow(
      {},
      new Date('2026-10-19T08:00:00.000Z'),
    );

    expect(window.days).toBe(31);
    expect(window.toExclusive.toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });

  it('rejects a range longer than a year', () => {
    expect(() =>
      resolveEconomicsWindow({ from: '2025-01-01', to: '2026-09-30' }),
    ).toThrow();
  });
});

describe('economics totals', () => {
  it('derives the cash margin and the pricing margin from summed money', () => {
    const totals = buildEconomicsTotals(
      {
        ...EMPTY_ECONOMICS_DAILY_AGGREGATE,
        creditsConsumed: 2_000,
        llmCalls: 10,
        llmCostMicros: 1_250_000,
        mediaCostMicros: 2_750_000,
        mediaGenerations: 4,
        revenueEvents: 2,
        revenueMinor: 2_000,
      },
      { active: 3, paying: 1 },
    );

    expect(totals).toMatchObject({
      activeOrganizations: 3,
      creditValueUsd: 20,
      grossMarginPercent: 80,
      grossMarginUsd: 16,
      llmCostUsd: 1.25,
      mediaCostUsd: 2.75,
      payingOrganizations: 1,
      pricingMarginPercent: 80,
      pricingMarginUsd: 16,
      providerCostUsd: 4,
      revenueUsd: 20,
    });
  });

  it('has no margin percentage without revenue or credits, but keeps the loss', () => {
    const totals = buildEconomicsTotals(
      { ...EMPTY_ECONOMICS_DAILY_AGGREGATE, llmCostMicros: 420_000 },
      { active: 0, paying: 0 },
    );

    expect(totals.grossMarginUsd).toBe(-0.42);
    expect(totals.grossMarginPercent).toBeNull();
    expect(totals.pricingMarginUsd).toBe(-0.42);
    expect(totals.pricingMarginPercent).toBeNull();
  });

  it('shows quiet days as zero in the daily series', () => {
    const points = buildDailyPoints(
      ['2026-09-01', '2026-09-02'],
      new Map([
        [
          '2026-09-02',
          {
            ...EMPTY_ECONOMICS_DAILY_AGGREGATE,
            creditsConsumed: 100,
            llmCostMicros: 500_000,
            revenueMinor: 1_999,
          },
        ],
      ]),
    );

    expect(points).toEqual([
      {
        creditValueUsd: 0,
        date: '2026-09-01',
        llmCostUsd: 0,
        mediaCostUsd: 0,
        revenueUsd: 0,
      },
      {
        creditValueUsd: 1,
        date: '2026-09-02',
        llmCostUsd: 0.5,
        mediaCostUsd: 0,
        revenueUsd: 19.99,
      },
    ]);
  });
});

describe('operation coverage', () => {
  it('maps credit sources and media categories to the same operations', () => {
    expect(operationForCreditSource(ActivitySource.IMAGE_UPSCALE)).toBe(
      'image',
    );
    expect(operationForCreditSource(ActivitySource.AGENT_CHAT)).toBe(
      'agent_chat',
    );
    expect(operationForCreditSource(null)).toBe('other');
    expect(operationForMediaCategory('image')).toBe('image');
    expect(operationForMediaCategory('VIDEO_EDIT')).toBe('video');
    expect(operationForMediaCategory('SOURCE')).toBe('other');
  });

  it('flags an operation that spent credits but recorded no provider cost', () => {
    const operations = buildOperationCoverage({
      creditsBySource: [
        { credits: 100, source: ActivitySource.VOICE_GENERATION },
        { credits: 50, source: ActivitySource.IMAGE_GENERATION },
        { credits: 20, source: ActivitySource.AGENT_CHAT },
        { credits: 0, source: ActivitySource.MUSIC_GENERATION },
      ],
      llmChatCostMicros: 150_000,
      llmOtherCostMicros: 0,
      mediaCostByCategory: [{ category: 'IMAGE', costMicros: 300_000 }],
    });
    const byOperation = Object.fromEntries(
      operations.map((operation) => [operation.operation, operation]),
    );

    expect(byOperation.voice).toMatchObject({
      costUsd: 0,
      creditValueUsd: 1,
      pricingMarginUsd: 1,
      status: 'missing',
    });
    expect(byOperation.image).toMatchObject({
      costUsd: 0.3,
      creditValueUsd: 0.5,
      pricingMarginUsd: 0.2,
      status: 'tracked',
    });
    expect(byOperation.agent_chat).toMatchObject({
      costUsd: 0.15,
      status: 'tracked',
    });
    expect(byOperation.music?.status).toBe('tracked');
    expect(operations.map((operation) => operation.operation)).toEqual([
      'agent_chat',
      'image',
      'video',
      'music',
      'voice',
      'avatar',
      'other',
    ]);
  });
});
