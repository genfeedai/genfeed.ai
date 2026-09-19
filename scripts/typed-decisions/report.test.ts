import { describe, expect, it } from 'vitest';
import {
  type BenchmarkOutcome,
  formatAccuracy,
  isCorrectAnswer,
  percentile,
  renderCalibration,
  renderConfusionMatrix,
} from './report';

function outcome(
  expected: BenchmarkOutcome['expected'],
  predicted: BenchmarkOutcome['predicted'],
  confidence?: number,
): BenchmarkOutcome {
  return {
    expected,
    isCorrect: predicted !== undefined && predicted === expected,
    latencyMs: 10,
    ...(confidence === undefined ? {} : { confidence }),
    ...(predicted === undefined ? {} : { predicted }),
  };
}

describe('isCorrectAnswer', () => {
  it('compares discrete answers exactly', () => {
    expect(isCorrectAnswer('spam', 'spam', 0.1)).toBe(true);
    expect(isCorrectAnswer('spam', 'question', 0.1)).toBe(false);
    expect(isCorrectAnswer(true, false, 0.1)).toBe(false);
  });

  it('compares scores within the tolerance', () => {
    expect(isCorrectAnswer(0.5, 0.55, 0.1)).toBe(true);
    expect(isCorrectAnswer(0.5, 0.8, 0.1)).toBe(false);
  });
});

describe('percentile', () => {
  it('reports p50 and p95 over unsorted latencies', () => {
    const latencies = [400, 100, 900, 200, 300, 250, 150, 700, 500, 350];

    expect(percentile(latencies, 0.5)).toBe(300);
    expect(percentile(latencies, 0.95)).toBe(900);
  });

  it('is zero for an empty run', () => {
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe('formatAccuracy', () => {
  it('prints a share with its counts', () => {
    expect(formatAccuracy(3, 4)).toBe('75.0% (3/4)');
  });

  it('prints n/a when nothing was answered', () => {
    expect(formatAccuracy(0, 0)).toBe('n/a');
  });
});

describe('renderConfusionMatrix', () => {
  it('counts every expected/predicted pair', () => {
    const table = renderConfusionMatrix([
      outcome('spam', 'spam'),
      outcome('spam', 'question'),
      outcome('question', 'question'),
      outcome('question', undefined),
    ]);
    const rows = table.trimEnd().split('\n');

    expect(rows[0]).toContain('expected');
    expect(rows[1]?.replace(/\s+/g, ' ').trim()).toBe('question | 1 0');
    expect(rows[2]?.replace(/\s+/g, ' ').trim()).toBe('spam | 1 1');
  });

  it('skips a continuous score', () => {
    expect(renderConfusionMatrix([outcome(0.4, 0.4)])).toContain(
      'no discrete answers',
    );
  });

  it('says so when nothing was answered', () => {
    expect(renderConfusionMatrix([outcome('spam', undefined)])).toContain(
      'no discrete answers',
    );
  });
});

describe('renderCalibration', () => {
  it('reports accuracy per confidence bin, including a perfect 1.0', () => {
    const table = renderCalibration([
      outcome('spam', 'spam', 1),
      outcome('spam', 'question', 0.55),
      outcome('spam', 'spam', 0.52),
      outcome('spam', 'spam', 0.95),
    ]);

    expect(table).toContain('0.5–0.6  50.0% (1/2)');
    expect(table).toContain('0.9–1.0  100.0% (2/2)');
  });

  it('says so when no confidence came back', () => {
    expect(renderCalibration([outcome('spam', undefined)])).toContain(
      'no confidences returned',
    );
  });
});
