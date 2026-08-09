import { describe, expect, it } from 'vitest';
import {
  normalizeBatchReviewDecisions,
  normalizePostReviewEvents,
  parseReviewDecisionNormalizationArgs,
} from './normalize-review-decisions';

describe('review decision JSON normalization', () => {
  it('normalizes known Postgres aliases and makes missing decisions explicit', () => {
    const result = normalizeBatchReviewDecisions([
      {
        id: 'item-1',
        reviewDecision: 'APPROVED',
        reviewEvents: [
          { decision: 'REQUEST_CHANGES', reviewedAt: '2026-08-01T00:00:00Z' },
        ],
      },
      { id: 'item-2', reviewEvents: [] },
    ]);

    expect(result).toMatchObject({
      changed: true,
      stats: { explicitUnsets: 1, legacyAliases: 2, unknownCategories: {} },
      value: [
        {
          id: 'item-1',
          reviewDecision: 'approved',
          reviewEvents: [
            {
              decision: 'request_changes',
              reviewedAt: '2026-08-01T00:00:00Z',
            },
          ],
        },
        { id: 'item-2', reviewDecision: 'unset', reviewEvents: [] },
      ],
    });
  });

  it('is idempotent for canonical batch JSON', () => {
    const value = [
      {
        id: 'item-1',
        reviewDecision: 'unset',
        reviewEvents: [{ decision: 'approved' }],
      },
    ];
    expect(normalizeBatchReviewDecisions(value)).toEqual({
      changed: false,
      stats: { explicitUnsets: 0, legacyAliases: 0, unknownCategories: {} },
      value,
    });
  });

  it('keeps unknown values untouched and reports only a safe category', () => {
    const sensitiveValue = 'unexpected-review-decision-payload';
    const result = normalizePostReviewEvents([
      { decision: sensitiveValue, reviewedAt: '2026-08-01T00:00:00Z' },
    ]);
    const categories = Object.keys(result.stats.unknownCategories);

    expect(result.changed).toBe(false);
    expect(result.value).toEqual([
      { decision: sensitiveValue, reviewedAt: '2026-08-01T00:00:00Z' },
    ]);
    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatch(/^string:[a-f0-9]{12}$/);
    expect(categories.join(' ')).not.toContain(sensitiveValue);
  });

  it('defaults to dry-run and accepts a bounded batch size', () => {
    expect(parseReviewDecisionNormalizationArgs([])).toEqual({
      batchSize: 200,
      dryRun: true,
    });
    expect(
      parseReviewDecisionNormalizationArgs(['--batch=25', '--live']),
    ).toEqual({ batchSize: 25, dryRun: false });
  });
});
