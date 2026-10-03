import { describe, expect, it } from 'vitest';
import { GOLDEN_LABEL_SOURCES } from './golden-set.constants';
import type {
  GoldenCandidate,
  GoldenDecision,
  GoldenLabel,
  GoldenSetExcluded,
} from './golden-set.types';
import {
  applyAgreementFloor,
  buildPairs,
  computeSourceAgreement,
  resolveRows,
} from './label-quality';

function candidate(
  id: string,
  left: GoldenDecision,
  right: GoldenDecision,
): GoldenCandidate {
  return {
    brandId: 'brand',
    contentKey: id,
    contentKind: 'social-post',
    text: 'Invented text',
    promptBase: null,
    platform: null,
    labels: [
      {
        source: 'post-review',
        raterKey: 'a',
        decision: left,
        score: null,
        order: [0, id],
      },
      {
        source: 'evaluation-decision',
        raterKey: 'b',
        decision: right,
        score: null,
        order: [0, id],
      },
    ],
  };
}
function exclusions(): GoldenSetExcluded {
  return {
    conflict: 0,
    copyOfReview: 0,
    emptyText: 0,
    missingContent: 0,
    noBrand: 0,
    noLabel: 0,
    outOfScopeBrand: 0,
    residualIdentifier: 0,
    unsupportedKind: 0,
  };
}
function balanced(): GoldenCandidate[] {
  return Array.from({ length: 20 }, (_, i) =>
    candidate(
      String(i),
      i < 10 ? 'approve' : 'reject',
      i < 8 || (i >= 10 && i < 12) ? 'approve' : 'reject',
    ),
  );
}
describe('label agreement', () => {
  it('reproduces 16/20, balanced marginals, and kappa 0.6', () => {
    const result = computeSourceAgreement(balanced());
    expect(
      result.find((source) => source.source === 'post-review'),
    ).toMatchObject({
      pairs: 20,
      labels: 20,
      percentAgreement: 0.8,
      kappa: 0.6,
      status: 'kept',
    });
    expect(result.map((source) => source.source)).toEqual([
      ...GOLDEN_LABEL_SOURCES,
    ]);
    expect(
      result.find((source) => source.source === 'harness-seed'),
    ).toMatchObject({
      pairs: 0,
      percentAgreement: null,
      kappa: null,
      status: 'insufficient-overlap',
    });
  });
  it('keeps null kappa with unanimous approval and keeps insufficient overlap at 19', () => {
    const values = Array.from({ length: 20 }, (_, i) =>
      candidate(String(i), 'approve', 'approve'),
    );
    expect(
      computeSourceAgreement(values).find(
        (source) => source.source === 'post-review',
      ),
    ).toMatchObject({ percentAgreement: 1, kappa: null, status: 'kept' });
    expect(
      computeSourceAgreement(values.slice(0, 19)).find(
        (source) => source.source === 'post-review',
      )?.status,
    ).toBe('insufficient-overlap');
  });
  it('drops disagreement below the floor and removes those labels without mutating inputs', () => {
    const values = Array.from({ length: 20 }, (_, i) =>
      candidate(
        String(i),
        i < 10 ? 'approve' : 'reject',
        i < 10 ? 'reject' : 'approve',
      ),
    );
    const agreement = computeSourceAgreement(values);
    expect(
      agreement.find((source) => source.source === 'post-review'),
    ).toMatchObject({ kappa: -1, status: 'dropped' });
    expect(
      applyAgreementFloor(values, agreement).every(
        (row) => row.labels.length === 0,
      ),
    ).toBe(true);
    expect(values[0]?.labels).toHaveLength(2);
  });
  it('orients same-source pairs by rater and excludes identical source/rater pairs', () => {
    const value = candidate('x', 'approve', 'reject');
    const first = value.labels[0];
    const second = value.labels[1];
    if (!first || !second) throw new Error('Missing test labels');
    value.labels = [
      { ...first, raterKey: 'z' },
      { ...second, source: 'post-review', raterKey: 'a' },
      { ...first, raterKey: 'z' },
    ];
    expect(buildPairs([value]).get('post-review')).toEqual([
      ['reject', 'approve'],
      ['reject', 'approve'],
    ]);
    expect(buildPairs([value]).get('evaluation-decision')).toEqual([]);
  });
});
describe('row resolution', () => {
  it('excludes conflict and no-label rows', () => {
    const excluded = exclusions();
    const empty = { ...candidate('empty', 'approve', 'approve'), labels: [] };
    expect(
      resolveRows(
        [candidate('conflict', 'approve', 'reject'), empty],
        excluded,
      ),
    ).toEqual([]);
    expect(excluded).toMatchObject({ conflict: 1, noLabel: 1 });
  });
  it('includes score-derived decisions in conflict and takes the latest evaluation band', () => {
    const value = candidate('x', 'approve', 'approve');
    const scores: GoldenLabel[] = [
      {
        source: 'evaluation-score',
        raterKey: 'score',
        decision: 'approve',
        score: 64,
        order: [1, 'a'],
      },
      {
        source: 'evaluation-score',
        raterKey: 'score',
        decision: 'approve',
        score: 88,
        order: [1, 'b'],
      },
    ];
    value.labels.push(...scores);
    expect(resolveRows([value], exclusions())[0]).toMatchObject({
      expected: { decision: 'approve', scoreBand: { min: 0.75, max: 1 } },
      sources: ['evaluation-decision', 'evaluation-score', 'post-review'],
    });
    value.labels.push({
      source: 'evaluation-score',
      raterKey: 'other',
      decision: 'reject',
      score: 18,
      order: [2, 'c'],
    });
    const excluded = exclusions();
    expect(resolveRows([value], excluded)).toEqual([]);
    expect(excluded.conflict).toBe(1);
  });
});
