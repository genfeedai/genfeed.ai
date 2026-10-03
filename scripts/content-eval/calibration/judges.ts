import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import {
  buildTextScoringPrompt,
  TEXT_SCORING_PROMPT,
} from '@api/services/content-quality/content-quality-scorer.prompts';
import {
  CONTENT_QUALITY_SCORING_SCHEMA_NAME,
  contentQualityScoringSchema,
} from '@genfeedai/contracts/api-types/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import type { FixtureRow } from '../contracts';
import { requireModelFamily } from '../families';
import { MeteredCallError, meteredCall, sha256Digest } from '../provenance';
import { SpendCapExceededError } from '../spend';
import type {
  ArmProfileId,
  ArmScore,
  ArmSpec,
  ProductionProfileId,
  SkippedCrossFamily,
} from './contracts';
import {
  EVALUATIONS_JUDGE_SCHEMA_NAME,
  evaluationsJudgeResponseSchema,
  PRODUCTION_PROFILE_IDS,
} from './contracts';
import { bandFromCuts, roundMetric } from './statistics';
import type {
  ArmCallResult,
  ArmScoringInput,
  Band,
  ContentQualityArmInput,
  EvaluationsScorerOptions,
  EvaluationsScorerPort,
  JudgeScale,
  ProductionProfile,
} from './types';

export const CONTENT_QUALITY_SCALE: JudgeScale = {
  approveAt: 6,
  bandCuts: [4, 6, 8],
  max: 10,
  min: 1,
};
export const EVALUATIONS_SCALE: JudgeScale = {
  approveAt: 60,
  bandCuts: [25, 50, 75],
  max: 100,
  min: 0,
};
export const HARNESS_RUBRIC_SCALE: JudgeScale = {
  approveAt: 0.6,
  bandCuts: [0.25, 0.5, 0.75],
  max: 1,
  min: 0,
};
export const PRODUCTION_PROFILES: Readonly<
  Record<ProductionProfileId, ProductionProfile>
> = {
  'content-quality': {
    defaultModel: LLM_DEFAULTS.background,
    id: 'content-quality',
    scale: CONTENT_QUALITY_SCALE,
  },
  evaluations: {
    defaultModel: DEFAULT_TEXT_MODEL,
    id: 'evaluations',
    scale: EVALUATIONS_SCALE,
  },
};
export const STUB_EVALUATIONS_SYSTEM_PROMPT: string =
  'Stub stand-in for the database evaluation templates (system.evaluation, prompt.evaluation.post, prompt.evaluation.article). Score the content 0-100 overall and per dimension.';

export function scaleForProfile(profileId: ArmProfileId): JudgeScale {
  if (profileId === 'evaluations') {
    return EVALUATIONS_SCALE;
  }
  if (profileId === 'harness-rubric') {
    return HARNESS_RUBRIC_SCALE;
  }
  return CONTENT_QUALITY_SCALE;
}

export function normalizeScore(nativeScore: number, scale: JudgeScale): number {
  const clamped = Math.min(scale.max, Math.max(scale.min, nativeScore));
  return roundMetric((clamped - scale.min) / (scale.max - scale.min));
}

export function bandOf(nativeScore: number, scale: JudgeScale): Band {
  const clamped = Math.min(scale.max, Math.max(scale.min, nativeScore));
  return bandFromCuts(clamped, scale.bandCuts);
}

export function isApproved(nativeScore: number, scale: JudgeScale): boolean {
  return nativeScore >= scale.approveAt;
}

function armSpec(
  profileId: ArmProfileId,
  model: string,
  isPrimary: boolean,
  promptSource: ArmSpec['promptSource'],
): ArmSpec {
  return {
    armId: `${profileId}@${model}`,
    family: requireModelFamily(model),
    isPrimary,
    model,
    profileId,
    promptSource,
  };
}

export function buildArmSpecs({
  dispatcherKind,
  harnessJudgeKeys,
  plan,
}: ArmScoringInput): {
  arms: ArmSpec[];
  skippedCrossFamily: SkippedCrossFamily[];
} {
  const arms: ArmSpec[] = [];
  const skippedCrossFamily: SkippedCrossFamily[] = [];
  for (const profileId of PRODUCTION_PROFILE_IDS) {
    if (!plan.productionProfiles.includes(profileId)) {
      continue;
    }
    const profile = PRODUCTION_PROFILES[profileId];
    const promptSource =
      profileId === 'content-quality'
        ? 'production-code'
        : dispatcherKind === 'stub'
          ? 'stub-stand-in'
          : 'database-templates';
    const primary = armSpec(
      profileId,
      profile.defaultModel,
      true,
      promptSource,
    );
    arms.push(primary);
    for (const model of plan.crossFamilyModels) {
      if (requireModelFamily(model) === primary.family) {
        skippedCrossFamily.push({ model, profileId, reason: 'same-family' });
      } else {
        arms.push(armSpec(profileId, model, false, promptSource));
      }
    }
    if (profileId === 'content-quality' && plan.brandContext !== null) {
      arms.push(
        armSpec(
          'content-quality+criteria',
          profile.defaultModel,
          false,
          'production-code',
        ),
      );
    }
  }
  for (const model of harnessJudgeKeys) {
    arms.push(armSpec('harness-rubric', model, false, 'harness'));
  }
  return { arms, skippedCrossFamily };
}

export function toArmScore(
  arm: ArmSpec,
  row: FixtureRow,
  result: ArmCallResult,
): ArmScore {
  const scale = scaleForProfile(arm.profileId);
  const { nativeScore } = result;
  return {
    armId: arm.armId,
    band: nativeScore === null ? null : bandOf(nativeScore, scale),
    brandScore: result.brandScore,
    callId: result.callId,
    contentKind: row.contentKind,
    decision:
      nativeScore === null
        ? null
        : isApproved(nativeScore, scale)
          ? 'approve'
          : 'reject',
    failure: result.failure,
    fixtureId: row.id,
    nativeScore,
    normalizedScore:
      nativeScore === null ? null : normalizeScore(nativeScore, scale),
  };
}

function failedArmCall(error: unknown): ArmCallResult {
  if (error instanceof SpendCapExceededError) {
    throw error;
  }
  return {
    brandScore: null,
    callId: error instanceof MeteredCallError ? error.provenance.callId : null,
    failure: error instanceof Error ? error.message : String(error),
    nativeScore: null,
  };
}

export async function scoreContentQualityArm({
  context,
  harnessCriteria,
  model,
  output,
  row,
}: ContentQualityArmInput): Promise<ArmCallResult> {
  try {
    const { provenance, response } = await meteredCall(
      {
        dispatcher: context.dispatcher,
        ledger: context.ledger,
        rowId: row.id,
        rubricDigest: sha256Digest(TEXT_SCORING_PROMPT),
        rubricVersion:
          harnessCriteria === null
            ? 'content-quality-scorer'
            : 'content-quality-scorer+criteria',
      },
      {
        maxTokens: 1024,
        messages: [
          {
            content: buildTextScoringPrompt(
              output,
              harnessCriteria ?? undefined,
            ),
            role: 'user',
          },
        ],
        model,
        role: 'judge',
        schema: contentQualityScoringSchema,
        schemaName: CONTENT_QUALITY_SCORING_SCHEMA_NAME,
        seed: context.config.seed,
        temperature: 0.3,
      },
    );
    return {
      brandScore: null,
      callId: provenance.callId,
      failure: null,
      nativeScore: response.value.score,
    };
  } catch (error: unknown) {
    return failedArmCall(error);
  }
}

export function createStubEvaluationsScorer(
  options: EvaluationsScorerOptions,
): EvaluationsScorerPort {
  return {
    async close() {},
    async score({ model, output, row }): Promise<ArmCallResult> {
      try {
        const { provenance, response } = await meteredCall(
          {
            dispatcher: options.dispatcher,
            ledger: options.ledger,
            rowId: row.id,
            rubricDigest: sha256Digest(STUB_EVALUATIONS_SYSTEM_PROMPT),
            rubricVersion: 'evaluations-stub',
          },
          {
            maxTokens: 1024,
            messages: [
              { content: STUB_EVALUATIONS_SYSTEM_PROMPT, role: 'system' },
              { content: `[Content]: ${output}\n***`, role: 'user' },
            ],
            model,
            role: 'judge',
            schema: evaluationsJudgeResponseSchema,
            schemaName: EVALUATIONS_JUDGE_SCHEMA_NAME,
            seed: options.seed,
            temperature: 0.1,
          },
        );
        return {
          brandScore: response.value.scores.brand.overall,
          callId: provenance.callId,
          failure: null,
          nativeScore: response.value.overallScore,
        };
      } catch (error: unknown) {
        return failedArmCall(error);
      }
    },
  };
}
