import { MEDIA_TEXT_DECISION_QUESTIONS } from '@genfeedai/contracts/api-types/contracts';
import { describe, expect, it } from 'vitest';
import {
  parseMediaTextRow,
  parseModerationRow,
  renderModerationCategories,
  renderReadinessSummary,
  toModerationOutcomes,
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
});

describe('toModerationOutcomes', () => {
  it('scores each category against its own threshold', () => {
    const outcomes = toModerationOutcomes(
      ['hate'],
      { hate: 0.6, spam: 0.8 },
      { hate: 0.5, spam: 0.9, violence: 0.7 },
      12,
    );

    expect(outcomes).toEqual([
      {
        confidence: 0.6,
        expected: true,
        isCorrect: true,
        latencyMs: 12,
        predicted: true,
      },
      {
        confidence: 0.8,
        expected: false,
        isCorrect: true,
        latencyMs: 12,
        predicted: false,
      },
      {
        confidence: 0,
        expected: false,
        isCorrect: true,
        latencyMs: 12,
        predicted: false,
      },
    ]);
  });

  it('marks a missed label and a false flag incorrect', () => {
    const outcomes = toModerationOutcomes(
      ['violence'],
      { hate: 0.7, violence: 0.2 },
      { hate: 0.5, violence: 0.7 },
      1,
    );

    expect(outcomes.map((outcome) => outcome.isCorrect)).toEqual([
      false,
      false,
    ]);
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
