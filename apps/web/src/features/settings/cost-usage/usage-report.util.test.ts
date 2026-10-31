import { describe, expect, it } from 'vitest';
import {
  buildUsageRowsCsv,
  usageDailySeries,
  usageModelLabel,
} from './usage-report.util';

describe('usage report presentation', () => {
  it('removes routing namespaces from model labels', () => {
    expect(usageModelLabel('replicate/black-forest-labs/flux-schnell')).toBe(
      'flux-schnell',
    );
    expect(usageModelLabel(null)).toBe('—');
  });
  it('fills missing days and limits chart data to customer usage', () => {
    expect(
      usageDailySeries(
        [
          {
            date: '2026-09-02',
            creditsUsed: 3.5,
            generationCount: 2,
            byokCount: 0,
            providerCostMicros: 500000,
            providerCostUsd: 0.5,
          },
        ],
        '2026-09-01T12:00:00Z',
        '2026-09-03T12:00:00Z',
      ),
    ).toEqual([
      { date: '2026-09-01', creditsUsed: 0, generationCount: 0 },
      { date: '2026-09-02', creditsUsed: 3.5, generationCount: 2 },
      { date: '2026-09-03', creditsUsed: 0, generationCount: 0 },
    ]);
  });
  it('escapes exported text while preserving numeric credits', () => {
    expect(
      buildUsageRowsCsv([
        [' =SUM(1,1)', -2.5],
        ['quoted "label"', 0],
      ]),
    ).toBe('"\' =SUM(1,1)","-2.5"\r\n"quoted ""label""","0"');
  });
});
