import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeModerationCalibration } from '@api/services/moderation/moderation-calibration.util';
import { ModerationCategory } from '@genfeedai/contracts';
import { DEFAULT_MODERATION_THRESHOLDS } from '@genfeedai/contracts/api-types/contracts';

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../test/fixtures/media-gates/moderation-transcripts.jsonl',
);

describe('computeModerationCalibration', () => {
  it('computes precision and recall per category', () => {
    const rows = computeModerationCalibration(
      [
        { expected: ['hate'] as ModerationCategory[], scores: { hate: 0.9 } },
        { expected: ['hate'] as ModerationCategory[], scores: { hate: 0.1 } },
        { expected: [], scores: { hate: 0.8 } },
        { expected: [], scores: {} },
      ],
      DEFAULT_MODERATION_THRESHOLDS,
    );
    const hate = rows.find((row) => row.category === ModerationCategory.HATE);
    expect(hate).toEqual({
      category: ModerationCategory.HATE,
      falseNegatives: 1,
      falsePositives: 1,
      precision: 0.5,
      recall: 0.5,
      truePositives: 1,
    });
    const spam = rows.find((row) => row.category === ModerationCategory.SPAM);
    expect(spam?.precision).toBeNull();
    expect(spam?.recall).toBeNull();
  });

  it('keeps the labelled transcript fixture well-formed', () => {
    const categories = new Set<string>(Object.values(ModerationCategory));
    const rows = readFileSync(FIXTURE, 'utf8')
      .trim()
      .split('\n')
      .map(
        (line) =>
          JSON.parse(line) as {
            expected: string[];
            source: string;
            text: string;
          },
      );

    expect(rows.length).toBeGreaterThan(20);
    for (const row of rows) {
      expect(row.text.length).toBeGreaterThan(0);
      expect(row.source).toBe('synthetic');
      for (const category of row.expected) {
        expect(categories.has(category)).toBe(true);
      }
    }
    expect(rows.some((row) => row.expected.length === 0)).toBe(true);
    expect(
      rows.some((row) =>
        row.expected.includes(ModerationCategory.SEXUAL_MINORS),
      ),
    ).toBe(false);
  });
});
