import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPORT_ANALYZERS } from '../analyzers';
import type {
  ContentEvalReport,
  ContentEvalRunOptions,
  FixtureRow,
} from '../contracts';
import { createStubDispatcher } from '../dispatchers/stub';
import { renderSummary } from '../report';
import { runContentEval } from '../runner';
import { calibrationSummarySchema } from './contracts';
import { buildCalibrationSummary } from './summary';

function passRows(): FixtureRow[] {
  return Array.from({ length: 32 }, (_, index): FixtureRow => {
    const band = Math.floor(index / 8);
    return {
      brandFixtureId: 'synthetic-calibration',
      contentKind: 'social-post',
      expected: {
        decision: band < 2 ? 'reject' : 'approve',
        scoreBand: { max: (band + 1) / 4, min: band / 4 },
      },
      id: `calibration-${String(index).padStart(2, '0')}`,
      input: {
        brief: { bannedPhrases: [], isCtaRequired: false },
        output: `Band ${band} sample ${index}: A practical note for the next morning. Save this for later.`,
        prompt: 'Write a practical social post.',
      },
      rubricVersion: 'content-quality-v1',
      source: { reference: 'synthetic:calibration', visibility: 'synthetic' },
    };
  });
}

function options(fixturePath: string): ContentEvalRunOptions {
  return {
    createDispatcher: async () =>
      createStubDispatcher({
        qualityOf: (content) => {
          const band = Number(/^Band (\d)/.exec(content)?.[1] ?? '0');
          return (band + 0.5) / 4;
        },
      }),
    dispatcherKind: 'stub',
    fixturePath,
    judgeRegistryKeys: ['anthropic/claude-sonnet-5'],
    maxCredits: 100,
    models: [],
    now: new Date('2026-10-03T12:00:00.000Z'),
    runId: 'calibration-summary-test',
    seed: 7,
    suite: 'judge',
    tieBand: 0.05,
  };
}

async function passingReport(): Promise<ContentEvalReport> {
  const root = mkdtempSync(join(tmpdir(), 'calibration-'));
  try {
    const fixturePath = join(root, 'pass.jsonl');
    writeFileSync(
      fixturePath,
      `${passRows()
        .map((row) => JSON.stringify(row))
        .join('\n')}\n`,
    );
    const { report } = await runContentEval(options(fixturePath));
    return report;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('calibration summary', () => {
  it('builds a schema-valid summary without scores or fixture output text', async () => {
    const report = await passingReport();
    const summary = buildCalibrationSummary(report);
    const serialized = JSON.stringify(summary);

    expect(calibrationSummarySchema.safeParse(summary).success).toBe(true);
    expect(summary).toMatchObject({
      evidenceKind: 'stub-dispatcher',
      fixture: report.fixture,
      kind: 'content-eval-calibration-summary',
      passed: true,
      runId: report.runId,
      thresholdChecks: report.outcome.thresholdChecks,
      thresholdsVersion: report.thresholds.version,
    });
    expect(summary.calibration).not.toHaveProperty('scores');
    expect(serialized).not.toContain('"scores"');
    for (const row of report.outcome.rows) {
      if (typeof row.output === 'string') {
        expect(serialized).not.toContain(row.output);
      }
    }
  });

  it('rejects a report without a calibration section', async () => {
    const report = { ...(await passingReport()) };
    delete report.calibration;

    expect(() => buildCalibrationSummary(report)).toThrow(
      'report has no calibration section',
    );
  });

  it('renders the primary pooled calibration metrics', async () => {
    const report = await passingReport();

    expect(renderSummary(report, REPORT_ANALYZERS)).toContain(
      '  calibration content-quality@google/gemini-2.5-flash-lite: κband 1',
    );
  });
});
