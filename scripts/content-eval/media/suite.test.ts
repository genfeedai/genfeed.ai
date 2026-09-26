import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchSchema } from '../bench/schema';
import type { ContentEvalRunOptions } from '../contracts';
import { contentEvalReportSchema } from '../contracts';
import { createStubDispatcher } from '../dispatchers/stub';
import { runContentEval } from '../runner';
import { pairRatingSchema } from './rating-sheet';
import { mediaReportSchema } from './report';

const JUDGES = [
  'anthropic/claude-sonnet-5',
  'x-ai/grok-4.6',
  'qwen/qwen3-vl-235b',
  'mistralai/pixtral-large',
];

function options(
  argv: string[],
  overrides: Partial<ContentEvalRunOptions> = {},
): ContentEvalRunOptions {
  return {
    argv,
    createDispatcher: async () => createStubDispatcher(),
    dispatcherKind: 'stub',
    fixturePath: 'scripts/content-eval/media/tasks/bench-851b7c8',
    judgeRegistryKeys: JUDGES,
    maxCredits: 500,
    models: [
      'openai/gpt-image-2',
      'google/nano-banana-2',
      'black-forest-labs/flux-schnell',
    ],
    now: new Date('2026-09-26T12:00:00.000Z'),
    runId: 'media-ladder-test',
    seed: 3,
    suite: 'media-ladder',
    tieBand: 0.05,
    ...overrides,
  };
}

describe('media-ladder suite (stub dispatcher)', () => {
  it('writes a valid report with bench match records, a media section and metered spend', async () => {
    const { exitCode, report } = await runContentEval(
      options(['--task-set=bench', '--medium=image']),
    );

    expect(() => contentEvalReportSchema.parse(report)).not.toThrow();
    expect(report.aborted).toBeNull();
    expect(exitCode).toBe(0);
    expect(report.modelQualityAssessed).toBe(false);

    const media = mediaReportSchema.parse(report.media);
    expect(media.ladder.isPublicLadderEligible).toBe(false);
    expect(media.ladder.calibration.isDecisionGrade).toBe(false);
    expect(media.ladder.ladder.length).toBeGreaterThanOrEqual(4);
    // Character and product tasks need references the stub run does not supply.
    expect(
      media.ladder.tasks.filter((task) => task.skippedReason !== null),
    ).toHaveLength(2);

    expect(report.benchMatches?.length).toBeGreaterThan(0);
    for (const match of report.benchMatches ?? []) {
      matchSchema.parse(match);
      if (match.state === 'recorded') {
        expect(match.votes.length).toBeGreaterThanOrEqual(3);
      }
    }
    // No judge from either contestant's family, on any match.
    for (const record of media.ladder.matches) {
      const families = new Set(
        media.ladder.contestants
          .filter(
            (entry) =>
              entry.contestant.id === record.match.a.contestantId ||
              entry.contestant.id === record.match.b.contestantId,
          )
          .map((entry) => entry.family),
      );
      expect(record.votes.some((vote) => families.has(vote.judgeFamily))).toBe(
        false,
      );
    }

    expect(report.spend.byKind.generation).toBeGreaterThan(0);
    expect(report.spend.byKind.judge).toBeGreaterThan(0);
    expect(
      report.calls.some(
        (call) =>
          call.kind === 'generation' && call.costEvidence === 'retail-credits',
      ),
    ).toBe(true);
    expect(
      report.outcome.rows.every((row) => row.suite === 'media-ladder'),
    ).toBe(true);
  });

  it('marks the report aborted by spend and keeps the partial ladder', async () => {
    const { exitCode, report } = await runContentEval(
      options(['--task-set=bench'], { maxCredits: 12 }),
    );
    expect(report.aborted).toBe('spend');
    expect(exitCode).toBe(1);
    const media = mediaReportSchema.parse(report.media);
    expect(media.ladder.isAborted).toBe(true);
    expect(report.spend.spentCredits).toBeLessThanOrEqual(12);
  });

  it('re-scores the #3470 grid and writes an anchor sheet for the human pass', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'media-grid-'));
    const sheet = join(dir, 'anchors.json');
    const { report } = await runContentEval(
      options(['--task-set=schnell-grid', `--rating-sheet-out=${sheet}`], {
        models: ['black-forest-labs/flux-schnell'],
      }),
    );
    const media = mediaReportSchema.parse(report.media);
    expect(media.schnellGrid?.modelKey).toBe('black-forest-labs/flux-schnell');
    expect(media.ladder.tasks).toHaveLength(12);
    expect(
      media.ladder.contestants.map((entry) => entry.route.kind).sort(),
    ).toEqual(['compiled', 'raw']);
    const anchors = pairRatingSchema
      .array()
      .parse(JSON.parse(readFileSync(sheet, 'utf8')));
    expect(anchors.length).toBeGreaterThan(0);
    expect(
      anchors.every((anchor) =>
        anchor.aArtifact.startsWith('genfeed-ingredient://'),
      ),
    ).toBe(true);
  });

  it('refuses a panel that cannot seat three judges outside a pair’s families', async () => {
    await expect(
      runContentEval(
        options(['--task-set=bench'], {
          judgeRegistryKeys: [
            'anthropic/claude-sonnet-5',
            'openai/gpt-5.6-luna',
          ],
        }),
      ),
    ).rejects.toThrow(/Fewer than 3 eligible cross-family judges/);
  });
});
