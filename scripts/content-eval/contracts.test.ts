import { describe, expect, it } from 'vitest';
import { matchSchema } from './bench/schema';
import type { CalibrationSection } from './calibration/contracts';
import type { ReportInput } from './contracts';
import {
  CONTENT_EVAL_THRESHOLDS,
  contentEvalReportSchema,
  fixtureRowSchema,
  judgeVoteSchema,
  scoreBandSchema,
} from './contracts';
import { buildReport } from './report';

const BENCH_MATCH = {
  a: {
    artifactUrl: 'https://assets.example.com/bench/a.png',
    contestantId: 'flux-schnell',
    seed: 42,
    settings: { aspectRatio: '1:1', steps: 4 },
  },
  b: {
    artifactUrl: 'https://assets.example.com/bench/b.png',
    contestantId: 'flux-schnell.compiled',
    seed: 42,
    settings: { aspectRatio: '1:1', fidelity: 'guided' },
  },
  id: 'season-one-0001',
  recordedAt: '2026-09-26T12:00:00.000Z',
  seasonId: 'season-one',
  state: 'recorded',
  taskId: 'brand-kit-fidelity',
  taskVersion: 1,
  verdict: 'b',
  votes: [
    {
      choice: 'b',
      judgeModelId: 'anthropic/claude-sonnet-5',
      rationale: 'Kit rules held.',
    },
    {
      choice: 'b',
      judgeModelId: 'openai/gpt-5.6-luna',
      rationale: 'Accent used once.',
    },
    {
      choice: 'a',
      judgeModelId: 'x-ai/grok-4.6',
      rationale: 'Sharper product.',
    },
  ],
};

const REPORT_INPUT: ReportInput = {
  aborted: null,
  abortMessage: null,
  config: {
    contestants: [],
    dispatcher: 'stub',
    fixturePath: 'judge.synthetic.jsonl',
    judgeRegistryKeys: ['openai/gpt-5.6-luna'],
    maxCredits: 50,
    seed: 7,
    suite: 'judge',
    tieBand: 0.05,
  },
  fixture: {
    digest: `sha256:${'0'.repeat(64)}`,
    path: 'judge.synthetic.jsonl',
    rows: [],
  },
  generatedAt: '2026-10-03T12:00:00.000Z',
  outcome: {
    contestants: [],
    judges: [],
    pairs: [],
    positionBiasRate: null,
    rows: [],
    thresholdChecks: [],
  },
  revision: {
    sourceRevision: '0'.repeat(40),
    workingTreeDirty: false,
  },
  rubrics: [],
  runId: 'calibration-contract-test',
  spend: {
    calls: [],
    summary: {
      byKind: { generation: 0, judge: 0 },
      callCount: 0,
      maxCredits: 50,
      spentCredits: 0,
      spentUsd: 0,
    },
  },
};

const CALIBRATION_SECTION: CalibrationSection = {
  arms: [],
  crossFamily: [],
  injection: null,
  metrics: [],
  pointwisePositionBias: 'not-applicable-pointwise',
  positionBias: [],
  rubricAlignment: {
    autoReviewJudge: null,
    autoReviewReason: 'no production judge reaches κ ≥ 0.6',
    crossJudge: null,
    mapping: [],
  },
  schemaVersion: 1,
  scores: [],
  scoringSurface: {
    textDigest: `sha256:${'0'.repeat(64)}`,
    visionDigest: `sha256:${'0'.repeat(64)}`,
  },
  skippedCrossFamily: [],
  vision: null,
};

describe('calibration report contracts', () => {
  it('parses a report with a minimal calibration section lifted from the outcome', () => {
    const report = buildReport(
      {
        ...REPORT_INPUT,
        outcome: { ...REPORT_INPUT.outcome, calibration: CALIBRATION_SECTION },
      },
      [],
    );

    expect(contentEvalReportSchema.safeParse(report).success).toBe(true);
    expect(report.calibration).toEqual(CALIBRATION_SECTION);
    expect(report.outcome).not.toHaveProperty('calibration');
  });

  it('parses a report without a calibration section', () => {
    const report = buildReport(REPORT_INPUT, []);

    expect(contentEvalReportSchema.safeParse(report).success).toBe(true);
    expect(report).not.toHaveProperty('calibration');
  });

  it('sets the judge kappa threshold to 0.6', () => {
    expect(CONTENT_EVAL_THRESHOLDS.judgeMinKappa).toBe(0.6);
  });
});

describe('bench match records', () => {
  it('round-trips a match through JSON unchanged', () => {
    const parsed = matchSchema.parse(BENCH_MATCH);
    const reparsed = matchSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(reparsed).toEqual(parsed);
    // The bench defaults ratingChange to null until a ladder recompute.
    expect(reparsed.ratingChange).toBeNull();
  });

  it('rejects a signed or non-URL artifact reference shape', () => {
    expect(
      matchSchema.safeParse({
        ...BENCH_MATCH,
        a: { ...BENCH_MATCH.a, artifactUrl: 'not a url' },
      }).success,
    ).toBe(false);
  });
});

describe('fixture rows', () => {
  it('applies brief defaults to a minimal row', () => {
    const row = fixtureRowSchema.parse({
      brandFixtureId: 'synthetic-kelder',
      contentKind: 'social-post',
      id: 'row-1',
      input: { prompt: 'Write a post.' },
      rubricVersion: 'content-quality-v1',
      source: { reference: 'synthetic:kelder', visibility: 'synthetic' },
    });

    expect(row.input.brief).toEqual({
      bannedPhrases: [],
      isCtaRequired: false,
    });
    expect(row.expected).toEqual({});
  });

  it('rejects an inverted score band', () => {
    expect(scoreBandSchema.safeParse({ max: 0.2, min: 0.8 }).success).toBe(
      false,
    );
  });
});

describe('judge votes', () => {
  it('defaults matchId to null, so a calibration report written before matchId existed still parses', () => {
    const legacyVote = {
      callId: 'call-1',
      choice: 'a' as const,
      family: 'anthropic',
      judgeRegistryKey: 'anthropic/claude-sonnet-5',
      model: 'anthropic/claude-sonnet-5',
      modelVersion: null,
      provider: 'anthropic',
      rationale: 'ok',
      score: 0.8,
      // No `matchId` key: exactly the shape a pre-existing linked
      // `--calibration-report` (suite.ts) was written with.
    };
    expect(judgeVoteSchema.safeParse(legacyVote).success).toBe(true);
    expect(judgeVoteSchema.parse(legacyVote).matchId).toBeNull();
  });
});
