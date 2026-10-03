import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { TEXT_SCORING_PROMPT } from '@api/services/content-quality/content-quality-scorer.prompts';
import {
  CONTENT_QUALITY_SCORING_SCHEMA_NAME,
  contentQualityScoringSchema,
} from '@genfeedai/contracts/api-types/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import { describe, expect, it, vi } from 'vitest';
import type {
  FixtureRow,
  StubDispatcherOptions,
  SuiteContext,
} from '../contracts';
import { fixtureRowSchema } from '../contracts';
import { createStubDispatcher } from '../dispatchers/stub';
import { sha256Digest } from '../provenance';
import { createEvalJudge } from '../scorers/judge';
import { SpendCapExceededError, SpendLedger } from '../spend';
import {
  EVALUATIONS_JUDGE_SCHEMA_NAME,
  evaluationsJudgeResponseSchema,
  scoringSurfaceSchema,
} from './contracts';
import {
  bandOf,
  buildArmSpecs,
  CONTENT_QUALITY_SCALE,
  createStubEvaluationsScorer,
  EVALUATIONS_SCALE,
  HARNESS_RUBRIC_SCALE,
  isApproved,
  normalizeScore,
  STUB_EVALUATIONS_SYSTEM_PROMPT,
  scaleForProfile,
  scoreContentQualityArm,
  toArmScore,
} from './judges';
import type { CalibrationPlan } from './types';

const CROSS_MODEL = 'openai/gpt-5.6-luna';
const GOOGLE_MODEL = 'google/gemini-3.6-flash';
const OUTPUT = 'Our skillet is here. Shop now.';
const CRITERIA =
  'Brand evaluation criteria (score against these as well):\n- Calm voice.';
const ROW: FixtureRow = fixtureRowSchema.parse({
  brandFixtureId: 'synthetic-kelder',
  contentKind: 'social-post',
  id: 'row-1',
  input: { brief: { guidance: 'Calm voice.' }, prompt: 'Announce a skillet.' },
  rubricVersion: 'content-quality-v1',
  source: { reference: 'synthetic:kelder', visibility: 'synthetic' },
});

function context(
  options: StubDispatcherOptions = {},
  maxCredits = 100,
): SuiteContext {
  const dispatcher = createStubDispatcher(options);
  const ledger = new SpendLedger(maxCredits);
  return {
    config: {
      contestants: [],
      dispatcher: 'stub',
      fixturePath: 'synthetic:kelder',
      judgeRegistryKeys: [DEFAULT_TEXT_MODEL],
      maxCredits,
      seed: 7,
      suite: 'judge',
      tieBand: 0.05,
    },
    dispatcher,
    judge: createEvalJudge({ dispatcher, ledger, seed: 7 }),
    ledger,
    rows: [ROW],
    runId: 'judge-arms-test',
  };
}

function plan(overrides: Partial<CalibrationPlan> = {}): CalibrationPlan {
  const digest = sha256Digest('synthetic scoring surface');
  return {
    brandContext: null,
    crossFamilyModels: [],
    productionProfiles: ['content-quality', 'evaluations'],
    scoringSurface: scoringSurfaceSchema.parse({
      text: {
        digest,
        files: [],
        values: {
          contentQualityModel: LLM_DEFAULTS.background,
          evaluationTemplates: {
            article: 'prompt.evaluation.article',
            post: 'prompt.evaluation.post',
            system: 'system.evaluation',
          },
          evaluationsModel: DEFAULT_TEXT_MODEL,
          scoringSchema: CONTENT_QUALITY_SCORING_SCHEMA_NAME,
        },
      },
      version: 'scoring-surface-v1',
      vision: {
        digest,
        files: [],
        values: {
          mediaRubricVersion: 'synthetic-vision',
          scorerVisionModel: LLM_DEFAULTS.fastText,
          visionTemplates: { image: 'image', video: 'video' },
        },
      },
    }),
    ...overrides,
  };
}

describe('production judge arms', () => {
  it.each([
    { harnessCriteria: null, model: LLM_DEFAULTS.background },
    { harnessCriteria: null, model: CROSS_MODEL },
    { harnessCriteria: CRITERIA, model: LLM_DEFAULTS.background },
    { harnessCriteria: '', model: LLM_DEFAULTS.background },
  ])(
    'uses the exact content-quality prompt for $model with $harnessCriteria',
    async ({ harnessCriteria, model }) => {
      const suiteContext = context({ qualityOf: () => 0.875 });
      const complete = vi.spyOn(suiteContext.dispatcher, 'completeStructured');
      const result = await scoreContentQualityArm({
        context: suiteContext,
        harnessCriteria,
        model,
        output: OUTPUT,
        row: ROW,
      });

      expect(complete).toHaveBeenCalledTimes(1);
      expect(complete).toHaveBeenCalledWith({
        maxTokens: 1024,
        messages: [
          {
            content: harnessCriteria
              ? `${TEXT_SCORING_PROMPT}\n\n${harnessCriteria}\n\nContent:\n${OUTPUT}`
              : `${TEXT_SCORING_PROMPT}\n\nContent:\n${OUTPUT}`,
            role: 'user',
          },
        ],
        model,
        role: 'judge',
        schema: contentQualityScoringSchema,
        schemaName: CONTENT_QUALITY_SCORING_SCHEMA_NAME,
        seed: 7,
        temperature: 0.3,
      });
      expect(result).toEqual({
        brandScore: null,
        callId: suiteContext.ledger.calls[0]?.callId,
        failure: null,
        nativeScore: 9,
      });
      expect(suiteContext.ledger.calls[0]).toMatchObject({
        kind: 'judge',
        model,
        rowId: ROW.id,
        rubricDigest: sha256Digest(TEXT_SCORING_PROMPT),
        rubricVersion:
          harnessCriteria === null
            ? 'content-quality-scorer'
            : 'content-quality-scorer+criteria',
        seed: 7,
      });
    },
  );

  it.each([DEFAULT_TEXT_MODEL, CROSS_MODEL])(
    'uses the exact evaluations stand-in prompt for %s',
    async (model) => {
      const suiteContext = context({ qualityOf: () => 0.875 });
      const complete = vi.spyOn(suiteContext.dispatcher, 'completeStructured');
      const scorer = createStubEvaluationsScorer({
        dispatcher: suiteContext.dispatcher,
        ledger: suiteContext.ledger,
        seed: 7,
      });
      expect(STUB_EVALUATIONS_SYSTEM_PROMPT).toBe(
        'Stub stand-in for the database evaluation templates (system.evaluation, prompt.evaluation.post, prompt.evaluation.article). Score the content 0-100 overall and per dimension.',
      );
      const result = await scorer.score({ model, output: OUTPUT, row: ROW });

      expect(complete).toHaveBeenCalledTimes(1);
      expect(complete).toHaveBeenCalledWith({
        maxTokens: 1024,
        messages: [
          { content: STUB_EVALUATIONS_SYSTEM_PROMPT, role: 'system' },
          { content: `[Content]: ${OUTPUT}\n***`, role: 'user' },
        ],
        model,
        role: 'judge',
        schema: evaluationsJudgeResponseSchema,
        schemaName: EVALUATIONS_JUDGE_SCHEMA_NAME,
        seed: 7,
        temperature: 0.1,
      });
      expect(result).toEqual({
        brandScore: 88,
        callId: suiteContext.ledger.calls[0]?.callId,
        failure: null,
        nativeScore: 88,
      });
      expect(suiteContext.ledger.calls[0]).toMatchObject({
        kind: 'judge',
        model,
        rowId: ROW.id,
        rubricDigest: sha256Digest(STUB_EVALUATIONS_SYSTEM_PROMPT),
        rubricVersion: 'evaluations-stub',
        seed: 7,
      });
      await scorer.close();
    },
  );

  it('retains the metered call on failures from both scorers', async () => {
    const suiteContext = context({ failingModels: [CROSS_MODEL] });
    const contentQuality = await scoreContentQualityArm({
      context: suiteContext,
      harnessCriteria: null,
      model: CROSS_MODEL,
      output: OUTPUT,
      row: ROW,
    });
    const evaluations = await createStubEvaluationsScorer({
      dispatcher: suiteContext.dispatcher,
      ledger: suiteContext.ledger,
      seed: 7,
    }).score({ model: CROSS_MODEL, output: OUTPUT, row: ROW });

    expect(suiteContext.ledger.calls).toHaveLength(2);
    for (const [index, result] of [contentQuality, evaluations].entries()) {
      expect(result.nativeScore).toBeNull();
      expect(result.brandScore).toBeNull();
      expect(result.failure).toContain('Stub failure');
      expect(result.callId).toBe(suiteContext.ledger.calls[index]?.callId);
      expect(result.callId).not.toBeNull();
    }
  });

  it('lets the spend cap through both scorers', async () => {
    const suiteContext = context({}, 0.000_001);
    await expect(
      scoreContentQualityArm({
        context: suiteContext,
        harnessCriteria: null,
        model: CROSS_MODEL,
        output: OUTPUT,
        row: ROW,
      }),
    ).rejects.toThrow(SpendCapExceededError);
    await expect(
      createStubEvaluationsScorer({
        dispatcher: suiteContext.dispatcher,
        ledger: suiteContext.ledger,
        seed: 7,
      }).score({ model: CROSS_MODEL, output: OUTPUT, row: ROW }),
    ).rejects.toThrow(SpendCapExceededError);
    expect(suiteContext.ledger.calls).toHaveLength(0);
  });

  it.each([
    { nativeEvaluations: 0, nativeScorer: 1, quality: -1 },
    { nativeEvaluations: 100, nativeScorer: 10, quality: 2 },
  ])(
    'clamps custom quality $quality on both scorer schemas',
    async ({ nativeEvaluations, nativeScorer, quality }) => {
      const qualityOf = vi.fn(() => quality);
      const suiteContext = context({ qualityOf });
      const contentQuality = await scoreContentQualityArm({
        context: suiteContext,
        harnessCriteria: 'Earlier marker\nContent:\nnot the output',
        model: LLM_DEFAULTS.background,
        output: OUTPUT,
        row: ROW,
      });
      const evaluations = await createStubEvaluationsScorer({
        dispatcher: suiteContext.dispatcher,
        ledger: suiteContext.ledger,
        seed: 7,
      }).score({
        model: DEFAULT_TEXT_MODEL,
        output: `  ${OUTPUT}  `,
        row: ROW,
      });

      expect(qualityOf.mock.calls).toEqual([[OUTPUT], [OUTPUT]]);
      expect(contentQuality.nativeScore).toBe(nativeScorer);
      expect(evaluations.nativeScore).toBe(nativeEvaluations);
      expect(evaluations.brandScore).toBe(nativeEvaluations);
    },
  );

  it('uses custom quality for the harness rubric and the first-response override for battles', async () => {
    const suiteContext = context({
      isFirstAlwaysPreferred: true,
      qualityOf: (content) => (content === OUTPUT ? 0 : 1),
    });
    const pointwise = await suiteContext.judge.pointwise({
      judgeRegistryKey: DEFAULT_TEXT_MODEL,
      output: OUTPUT,
      row: ROW,
    });
    expect(pointwise.score).toBe(0);
    const battle = await suiteContext.judge.battle({
      first: OUTPUT,
      judgeRegistryKey: DEFAULT_TEXT_MODEL,
      row: ROW,
      second: 'Higher quality.',
    });
    expect(battle.isFirstPreferred).toBe(true);
  });
});

describe('buildArmSpecs', () => {
  it('keeps D-2 arm order and records a same-family cross key once', () => {
    const { arms, skippedCrossFamily } = buildArmSpecs({
      dispatcherKind: 'stub',
      harnessJudgeKeys: [CROSS_MODEL, DEFAULT_TEXT_MODEL],
      plan: plan({
        brandContext: { brands: {}, schemaVersion: 1 },
        crossFamilyModels: [CROSS_MODEL, GOOGLE_MODEL],
        productionProfiles: ['evaluations', 'content-quality'],
      }),
    });
    expect(arms.map((arm) => arm.armId)).toEqual([
      `content-quality@${LLM_DEFAULTS.background}`,
      `content-quality@${CROSS_MODEL}`,
      `content-quality+criteria@${LLM_DEFAULTS.background}`,
      `evaluations@${DEFAULT_TEXT_MODEL}`,
      `evaluations@${CROSS_MODEL}`,
      `evaluations@${GOOGLE_MODEL}`,
      `harness-rubric@${CROSS_MODEL}`,
      `harness-rubric@${DEFAULT_TEXT_MODEL}`,
    ]);
    expect(arms.map((arm) => arm.isPrimary)).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(arms.map((arm) => arm.promptSource)).toEqual([
      'production-code',
      'production-code',
      'production-code',
      'stub-stand-in',
      'stub-stand-in',
      'stub-stand-in',
      'harness',
      'harness',
    ]);
    expect(arms.map((arm) => arm.family)).toEqual([
      'google',
      'openai',
      'google',
      'anthropic',
      'openai',
      'google',
      'openai',
      'anthropic',
    ]);
    expect(skippedCrossFamily).toEqual([
      {
        model: GOOGLE_MODEL,
        profileId: 'content-quality',
        reason: 'same-family',
      },
    ]);
  });

  it('uses database-template provenance for live evaluations and omits unselected arms', () => {
    const { arms } = buildArmSpecs({
      dispatcherKind: 'live',
      harnessJudgeKeys: [],
      plan: plan({
        brandContext: { brands: {}, schemaVersion: 1 },
        productionProfiles: ['evaluations'],
      }),
    });
    expect(arms).toEqual([
      {
        armId: `evaluations@${DEFAULT_TEXT_MODEL}`,
        family: 'anthropic',
        isPrimary: true,
        model: DEFAULT_TEXT_MODEL,
        profileId: 'evaluations',
        promptSource: 'database-templates',
      },
    ]);
  });
});

describe('arm score scales', () => {
  it('clamps normalized scores and bands, and uses native approval thresholds', () => {
    expect(scaleForProfile('content-quality+criteria')).toBe(
      CONTENT_QUALITY_SCALE,
    );
    expect(scaleForProfile('evaluations')).toBe(EVALUATIONS_SCALE);
    expect(scaleForProfile('harness-rubric')).toBe(HARNESS_RUBRIC_SCALE);
    expect(normalizeScore(6, CONTENT_QUALITY_SCALE)).toBe(0.5556);
    expect(normalizeScore(-1, EVALUATIONS_SCALE)).toBe(0);
    expect(normalizeScore(2, HARNESS_RUBRIC_SCALE)).toBe(1);
    expect(
      [3, 4, 6, 8].map((score) => bandOf(score, CONTENT_QUALITY_SCALE)),
    ).toEqual([0, 1, 2, 3]);
    expect(bandOf(-1, EVALUATIONS_SCALE)).toBe(0);
    expect(bandOf(2, HARNESS_RUBRIC_SCALE)).toBe(3);
    expect(isApproved(5.99, CONTENT_QUALITY_SCALE)).toBe(false);
    expect(isApproved(6, CONTENT_QUALITY_SCALE)).toBe(true);
    expect(isApproved(60, EVALUATIONS_SCALE)).toBe(true);
    expect(isApproved(0.6, HARNESS_RUBRIC_SCALE)).toBe(true);
  });

  it('maps scores and preserves nulls for a failed arm call', () => {
    const { arms } = buildArmSpecs({
      dispatcherKind: 'stub',
      harnessJudgeKeys: [],
      plan: plan(),
    });
    const arm = arms[0];
    if (!arm) {
      throw new Error('Missing primary content-quality arm');
    }
    expect(
      toArmScore(arm, ROW, {
        brandScore: null,
        callId: 'call-1',
        failure: null,
        nativeScore: 6,
      }),
    ).toEqual({
      armId: arm.armId,
      band: 2,
      brandScore: null,
      callId: 'call-1',
      contentKind: ROW.contentKind,
      decision: 'approve',
      failure: null,
      fixtureId: ROW.id,
      nativeScore: 6,
      normalizedScore: 0.5556,
    });
    expect(
      toArmScore(arm, ROW, {
        brandScore: null,
        callId: 'call-2',
        failure: 'Stub failure',
        nativeScore: null,
      }),
    ).toMatchObject({
      band: null,
      callId: 'call-2',
      decision: null,
      failure: 'Stub failure',
      nativeScore: null,
      normalizedScore: null,
    });
  });
});
