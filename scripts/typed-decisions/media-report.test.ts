import { MEDIA_TEXT_DECISION_QUESTIONS } from '@genfeedai/contracts/api-types/contracts';
import { describe, expect, it } from 'vitest';
import {
  binByScore,
  parseMediaTextRow,
  parseModerationRow,
  renderModerationCategories,
  renderReadinessSummary,
  renderScoreBins,
  type ScoreBin,
  suggestThreshold,
} from './media-report';

describe('parseModerationRow', () => {
  it('reads a transcript row and an image-manifest row', () => {
    expect(
      parseModerationRow(
        '{"expected":["hate"],"source":"synthetic","text":"x"}',
        0,
      ),
    ).toEqual({ expected: ['hate'], source: 'synthetic', text: 'x' });
    expect(
      parseModerationRow('{"expected":[],"url":"https://cdn/a.jpg"}', 1),
    ).toEqual({ expected: [], source: 'unknown', url: 'https://cdn/a.jpg' });
  });

  it('rejects a row without an expected array or an input', () => {
    expect(() => parseModerationRow('{"text":"x"}', 0)).toThrow(/row 1/);
    expect(() => parseModerationRow('{"expected":[]}', 2)).toThrow(/row 3/);
  });

  it('rejects a label that is not a moderation category', () => {
    expect(() =>
      parseModerationRow('{"expected":["self-harm"],"text":"x"}', 0),
    ).toThrow(/row 1 names unknown categories: self-harm/);
  });
});

function bin(lower: number, positives: number, total: number): ScoreBin {
  return { lower, positives, total, upper: lower + 0.1 };
}

describe('binByScore', () => {
  it('buckets scores into deciles, counting positives, with 1 in the top bin', () => {
    const bins = binByScore([
      { isPositive: false, score: 0 },
      { isPositive: true, score: 0.55 },
      { isPositive: false, score: 0.59 },
      { isPositive: true, score: 1 },
    ]);

    expect(bins).toHaveLength(10);
    expect(bins[0]).toMatchObject({ positives: 0, total: 1 });
    expect(bins[5]).toMatchObject({ positives: 1, total: 2 });
    expect(bins[9]).toMatchObject({ positives: 1, total: 1 });
  });
});

describe('suggestThreshold', () => {
  it('returns the lowest floor from which every bin clears the rate with enough positives', () => {
    const bins = [
      bin(0, 0, 90),
      bin(0.5, 3, 10),
      bin(0.6, 10, 10),
      bin(0.7, 0, 0),
      bin(0.8, 12, 12),
    ];

    expect(suggestThreshold(bins)).toBeCloseTo(0.6);
  });

  it('is null when too few positives clear the rate', () => {
    expect(suggestThreshold([bin(0.8, 5, 5), bin(0.9, 5, 5)])).toBeNull();
  });

  it('is null when the top bin already misses the rate', () => {
    expect(suggestThreshold([bin(0.8, 40, 40), bin(0.9, 1, 3)])).toBeNull();
  });
});

describe('renderScoreBins', () => {
  it('prints non-empty bins and the suggestion, or why there is none', () => {
    const bins = [bin(0, 0, 4), bin(0.1, 0, 0), bin(0.9, 2, 2)];

    const withSuggestion = renderScoreBins(bins, 0.9);
    expect(withSuggestion).toContain('0.0–0.1  positive 0.0% (0/4)');
    expect(withSuggestion).not.toContain('0.1–0.2');
    expect(withSuggestion).toContain('suggested: 0.9');
    expect(renderScoreBins(bins, null)).toContain(
      'suggested: n/a (needs >= 20 positives in bins at >= 95%; 2 labelled)',
    );
  });
});

describe('renderModerationCategories', () => {
  it('prints thresholds, precision and recall, n/a when unmeasurable', () => {
    const table = renderModerationCategories(
      [
        {
          category: 'hate',
          falseNegatives: 1,
          falsePositives: 0,
          precision: 1,
          recall: 0.5,
          truePositives: 1,
        },
        {
          category: 'sexual_minors',
          falseNegatives: 0,
          falsePositives: 0,
          precision: null,
          recall: null,
          truePositives: 0,
        },
      ],
      { hate: 0.5, sexual_minors: 0.2 },
    );

    expect(table).toContain('hate');
    expect(table).toMatch(/hate\s+0\.50\s+100\.0%\s+50\.0%\s+1\s+0\s+1/);
    expect(table).toMatch(/sexual_minors\s+0\.20\s+n\/a\s+n\/a/);
  });
});

describe('renderReadinessSummary', () => {
  it('groups by platform and kind and lists every miss', () => {
    const summary = renderReadinessSummary([
      {
        isCorrect: true,
        reported: [],
        sample: {
          expected: null,
          id: 'tiktok/video/compliant',
          kind: 'video',
          platform: 'tiktok',
        },
      },
      {
        isCorrect: false,
        reported: ['aspectRatio:warning'],
        sample: {
          expected: { property: 'width', severity: 'error' },
          id: 'tiktok/video/width-below-min',
          kind: 'video',
          platform: 'tiktok',
        },
      },
    ]);

    expect(summary).toContain('tiktok/video       50.0% (1/2)');
    expect(summary).toContain(
      'MISS tiktok/video/width-below-min: expected width:error, reported aspectRatio:warning',
    );
  });
});

describe('parseMediaTextRow', () => {
  it('flattens one case per question with the production question text', () => {
    const cases = parseMediaTextRow(
      '{"expected":{"isBrandSafe":true,"isOnBrand":false},"source":"synthetic","state":{"transcript":"hi"}}',
      0,
    );

    expect(cases).toEqual([
      {
        expected: true,
        name: 'isBrandSafe',
        question: MEDIA_TEXT_DECISION_QUESTIONS.isBrandSafe,
        source: 'synthetic',
        state: { transcript: 'hi' },
      },
      {
        expected: false,
        name: 'isOnBrand',
        question: MEDIA_TEXT_DECISION_QUESTIONS.isOnBrand,
        source: 'synthetic',
        state: { transcript: 'hi' },
      },
    ]);
  });

  it('rejects an unknown question name', () => {
    expect(() =>
      parseMediaTextRow('{"expected":{"isFunny":true},"state":{}}', 4),
    ).toThrow(/row 5: `isFunny`/);
  });
});
