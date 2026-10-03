import { describe, expect, it } from 'vitest';
import type { CallProvenance, ContentEvalReport } from '../contracts';
import {
  CONTENT_EVAL_REPORT_SCHEMA_VERSION,
  CONTENT_EVAL_THRESHOLDS,
} from '../contracts';
import { catalogueCostUsd, reservationCostUsd, usdToCredits } from '../spend';
import {
  DEFAULT_EVALUATIONS_PROMPT_ALLOWANCE,
  expectedCompletionTokens,
  quoteReport,
} from './quote';

const GEMINI = 'google/gemini-2.5-flash-lite';
const LUNA = 'openai/gpt-5.6-luna';
const DIGEST = `sha256:${'0'.repeat(64)}`;

function call(overrides: Partial<CallProvenance> = {}): CallProvenance {
  return {
    callId: 'call-1-judge',
    capabilityProfileVersion: null,
    completionTokens: 10,
    compilerVersion: null,
    costEvidence: 'reported',
    costUsd: 0,
    credits: 0,
    family: 'google',
    isFailed: false,
    kind: 'judge',
    latencyMs: 5,
    model: GEMINI,
    modelVersion: `${GEMINI}@stub`,
    promptDigest: DIGEST,
    promptTokens: 100,
    provider: 'stub',
    rowId: 'row-1',
    rubricDigest: DIGEST,
    rubricVersion: 'content-quality-scorer',
    seed: 1,
    settings: { maxTokens: 1024, temperature: 0 },
    ...overrides,
  };
}

function report(calls: CallProvenance[], rowCount = 10): ContentEvalReport {
  return {
    aborted: null,
    abortMessage: null,
    calls,
    config: {
      contestants: [],
      dispatcher: 'stub',
      fixturePath: 'synthetic:quote',
      judgeRegistryKeys: [GEMINI],
      maxCredits: 100,
      seed: 1,
      suite: 'judge',
      tieBand: 0.05,
    },
    dispatcher: 'stub',
    evidenceKind: 'stub-dispatcher',
    fixture: { digest: DIGEST, path: 'synthetic:quote', rowCount },
    generatedAt: '2026-10-03T12:00:00.000Z',
    modelQualityAssessed: false,
    outcome: {
      contestants: [],
      judges: [],
      pairs: [],
      positionBiasRate: null,
      rows: [],
      thresholdChecks: [],
    },
    passed: true,
    rubrics: [],
    runId: 'calibration-quote-test',
    schemaVersion: CONTENT_EVAL_REPORT_SCHEMA_VERSION,
    sourceRevision: '0'.repeat(40),
    spend: {
      byKind: { generation: 0, judge: 0 },
      callCount: calls.length,
      maxCredits: 100,
      spentCredits: 0,
      spentUsd: 0,
    },
    suite: 'judge',
    thresholds: CONTENT_EVAL_THRESHOLDS,
    workingTreeDirty: false,
  };
}

describe('calibration cost quote', () => {
  it('prices the rubric prefixes, adds only the stub allowance and sorts models', () => {
    const calls = [
      call({ model: LUNA, rubricVersion: 'evaluations-stub' }),
      call({ rubricVersion: 'content-quality-scorer' }),
      call({ rubricVersion: 'content-quality-scorer+criteria' }),
      call({ model: LUNA, rubricVersion: 'content-quality-v1' }),
      call({ model: LUNA, rubricVersion: 'autoevals-battle@0.3.0' }),
      call({ kind: 'generation', promptTokens: 1_000_000 }),
    ];
    const quote = quoteReport(
      report(calls),
      DEFAULT_EVALUATIONS_PROMPT_ALLOWANCE,
    );

    expect(expectedCompletionTokens('content-quality-scorer+criteria')).toBe(
      250,
    );
    expect(expectedCompletionTokens('evaluations@database-templates')).toBe(
      600,
    );
    expect(expectedCompletionTokens(null)).toBe(300);
    expect(expectedCompletionTokens('other-rubric')).toBe(300);
    expect(quote).toEqual({
      capUsd: 0.006537,
      evaluationsPromptAllowance: 3000,
      expectedUsd: 0.00127,
      models: [
        {
          calls: 2,
          capUsd: 0.001883,
          expectedUsd: 0.00022,
          model: GEMINI,
          promptTokens: 200,
        },
        {
          calls: 3,
          capUsd: 0.004654,
          expectedUsd: 0.00105,
          model: LUNA,
          promptTokens: 3300,
        },
      ],
      perRowExpectedUsd: 0.000127,
      recommendedMaxCredits: 1,
      reportRunId: 'calibration-quote-test',
      rowCount: 10,
    });
    const liveTemplateQuote = quoteReport(
      report([
        call({ model: LUNA, rubricVersion: 'evaluations@database-templates' }),
      ]),
      3000,
    );
    expect(liveTemplateQuote.models[0]?.promptTokens).toBe(100);
    expect(liveTemplateQuote.expectedUsd).toBe(0.00037);
  });

  it('uses the reservation fallback for a catalogue-absent model', () => {
    const model = 'unknown/model';
    expect(catalogueCostUsd(model, 100, 300)).toBeNull();
    const quote = quoteReport(
      report([call({ model, rubricVersion: null, settings: {} })]),
      0,
    );
    const reserved = reservationCostUsd(model, 100, 300);
    const rounded = Math.round(reserved * 1_000_000) / 1_000_000;

    expect(quote.expectedUsd).toBe(rounded);
    expect(quote.capUsd).toBe(rounded);
    expect(quote.models).toEqual([
      {
        calls: 1,
        capUsd: rounded,
        expectedUsd: rounded,
        model,
        promptTokens: 100,
      },
    ]);
    expect(quote.recommendedMaxCredits).toBe(Math.ceil(usdToCredits(rounded)));
  });

  it('quotes zero cost without judge calls and null per-row cost without rows', () => {
    const calls = [call({ kind: 'generation' })];
    const quote = quoteReport(report(calls), 3000);

    expect(quote).toMatchObject({
      capUsd: 0,
      expectedUsd: 0,
      models: [],
      perRowExpectedUsd: 0,
      recommendedMaxCredits: 0,
    });
    expect(quoteReport(report([], 0), 3000).perRowExpectedUsd).toBeNull();
  });
});
