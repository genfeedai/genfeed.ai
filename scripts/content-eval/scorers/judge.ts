/**
 * Judge wrapper. The prompts and choice-score semantics are autoevals'
 * LLMClassifierFromTemplate and Battle (chain-of-thought on, a closed set of
 * choices mapped to scores), but execution goes through the harness
 * dispatcher port — autoevals' own OpenAI client would call a provider URL
 * directly and skip retention policy and the vendor cost ledger. The
 * classifier's tool call becomes a structured `{ reasons, choice }` answer,
 * `reasons` first so the model reasons before it commits.
 */

import { z } from 'zod';
import {
  type BattleJudgement,
  type BattleJudgeRequest,
  type CallProvenance,
  CLAIM_VERDICTS,
  type ClaimVerdict,
  type EvalJudge,
  type EvalJudgeOptions,
  type EvalRubricSpec,
  type JudgeClassifyInput,
  type JudgeClassifyResult,
  type JudgeVote,
  type PointwiseJudgement,
  type PointwiseJudgeRequest,
  type RubricRecord,
} from '../contracts';
import { requireModelFamily } from '../families';
import { MeteredCallError, meteredCall } from '../provenance';
import { SpendCapExceededError } from '../spend';
import {
  BATTLE_RUBRIC,
  isClaimRubric,
  RUBRICS_BY_VERSION,
  renderClaims,
  renderTemplate,
  rubricDigest,
  toRubricRecord,
} from './rubrics';

export const JUDGE_SCHEMA_NAME = 'content_eval_judge_classification';
export const CLAIMS_JUDGE_SCHEMA_NAME = 'content_eval_judge_claims';
const JUDGE_MAX_TOKENS = 1024;
// Reasons for every claim in one answer.
const CLAIMS_JUDGE_MAX_TOKENS = 2048;
const JUDGE_TEMPERATURE = 0;

function cotSuffix(choices: string[]): string {
  return [
    'Answer with `reasons` and `choice`.',
    'Write `reasons` first, step by step, to be sure your conclusion is correct;',
    'do not state the answer at the outset.',
    `Then set \`choice\` to exactly one of: ${choices.join(', ')}.`,
  ].join(' ');
}

function classificationSchema(choices: string[]) {
  const [first, ...rest] = choices;
  if (first === undefined) {
    throw new Error('A rubric needs at least one choice');
  }

  return z.object({
    reasons: z.string().min(1),
    choice: z.enum([first, ...rest]),
  });
}

/** Pointwise rubric a fixture row names; the pairwise rubric is fixed. */
export function resolvePointwiseRubric(rubricVersion: string): EvalRubricSpec {
  const spec = RUBRICS_BY_VERSION.get(rubricVersion);
  if (!spec || spec.id === BATTLE_RUBRIC.id) {
    const known = [...RUBRICS_BY_VERSION.values()]
      .filter((entry) => entry.id !== BATTLE_RUBRIC.id)
      .map((entry) => entry.version);
    throw new Error(
      `Unknown pointwise rubric "${rubricVersion}"; known: ${known.join(', ')}`,
    );
  }

  return spec;
}

function claimsSchema(spec: EvalRubricSpec) {
  const [first, ...rest] = (spec.claims ?? []).map((claim) => claim.id);
  if (first === undefined) {
    throw new Error(`Rubric ${spec.version} has no claims`);
  }

  return z.object({
    claims: z.array(
      z.object({
        claimId: z.enum([first, ...rest]),
        reasons: z.string().min(1),
        verdict: z.enum(CLAIM_VERDICTS),
      }),
    ),
  });
}

const CLAIMS_SUFFIX = [
  'Answer with `claims`: one entry per claim, in the order listed, with its',
  '`claimId`, then `reasons` (write these first, step by step), then `verdict`.',
].join(' ');

/**
 * Every listed claim answered exactly once, and the share of applicable ones
 * that pass. A score needs at least one applicable claim.
 */
export function scoreClaimVerdicts(
  spec: EvalRubricSpec,
  verdicts: ClaimVerdict[],
): number {
  const expected = (spec.claims ?? []).map((claim) => claim.id);
  const answered = verdicts.map((entry) => entry.claimId);
  const missing = expected.filter((id) => !answered.includes(id));
  if (missing.length > 0 || answered.length !== expected.length) {
    throw new Error(
      `Claim verdicts must answer each claim once; missing ${missing.join(', ') || 'none'}, got ${answered.length} of ${expected.length}`,
    );
  }
  const applicable = verdicts.filter(
    (entry) => entry.verdict !== 'not-applicable',
  );
  if (applicable.length === 0) {
    throw new Error('Every claim was not-applicable; no score can be derived');
  }
  const passed = applicable.filter((entry) => entry.verdict === 'pass');
  return Math.round((passed.length / applicable.length) * 1e4) / 1e4;
}

interface ClaimsJudgement {
  provenance: CallProvenance;
  rationale: string;
  score: number | null;
  verdicts: ClaimVerdict[] | null;
}

function isFatal(error: unknown): boolean {
  return error instanceof SpendCapExceededError;
}

/** The charged call behind a failure, so the void still carries its cost. */
function failedCall(error: unknown): CallProvenance | null {
  return error instanceof MeteredCallError ? error.provenance : null;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function vote(
  judgeRegistryKey: string,
  provenance: CallProvenance | null,
  fields: Pick<JudgeVote, 'choice' | 'rationale' | 'score'>,
): JudgeVote {
  return {
    callId: provenance?.callId ?? null,
    family: requireModelFamily(judgeRegistryKey),
    judgeRegistryKey,
    // Neither battle nor pointwise text judging tracks a formal match id;
    // battle pairs are identified by `PairwiseResult`, not by vote.
    matchId: null,
    model: judgeRegistryKey,
    modelVersion: provenance?.modelVersion ?? null,
    provider: provenance?.provider ?? null,
    ...fields,
  };
}

export function createEvalJudge({
  dispatcher,
  ledger,
  seed,
}: EvalJudgeOptions): EvalJudge {
  const usedRubrics = new Map<string, EvalRubricSpec>();

  async function classify({
    judgeRegistryKey,
    rowId,
    spec,
    variables,
  }: JudgeClassifyInput): Promise<JudgeClassifyResult> {
    usedRubrics.set(spec.version, spec);
    const choices = Object.keys(spec.choiceScores);
    const prompt = `${renderTemplate(spec.promptTemplate, variables)}\n${cotSuffix(choices)}`;
    const { provenance, response } = await meteredCall(
      {
        dispatcher,
        ledger,
        rowId,
        rubricDigest: rubricDigest(spec),
        rubricVersion: spec.version,
      },
      {
        maxTokens: JUDGE_MAX_TOKENS,
        messages: [{ content: prompt, role: 'user' }],
        model: judgeRegistryKey,
        role: 'judge',
        schema: classificationSchema(choices),
        schemaName: JUDGE_SCHEMA_NAME,
        seed,
        temperature: JUDGE_TEMPERATURE,
      },
    );

    return {
      choice: response.value.choice,
      provenance,
      reasons: response.value.reasons,
    };
  }

  /** One call answers every claim; the verdicts become the score. */
  async function checkClaims({
    judgeRegistryKey,
    rowId,
    spec,
    variables,
  }: JudgeClassifyInput): Promise<ClaimsJudgement> {
    usedRubrics.set(spec.version, spec);
    const prompt = `${renderTemplate(spec.promptTemplate, {
      ...variables,
      claims: renderClaims(spec),
    })}\n${CLAIMS_SUFFIX}`;
    const { provenance, response } = await meteredCall(
      {
        dispatcher,
        ledger,
        rowId,
        rubricDigest: rubricDigest(spec),
        rubricVersion: spec.version,
      },
      {
        maxTokens: CLAIMS_JUDGE_MAX_TOKENS,
        messages: [{ content: prompt, role: 'user' }],
        model: judgeRegistryKey,
        role: 'judge',
        schema: claimsSchema(spec),
        schemaName: CLAIMS_JUDGE_SCHEMA_NAME,
        seed,
        temperature: JUDGE_TEMPERATURE,
      },
    );
    const verdicts = response.value.claims;
    try {
      return {
        provenance,
        rationale: verdicts
          .map(
            (entry) => `[${entry.claimId}] ${entry.verdict}: ${entry.reasons}`,
          )
          .join('\n'),
        score: scoreClaimVerdicts(spec, verdicts),
        verdicts,
      };
    } catch (error: unknown) {
      // The call was charged; keep its provenance on the void.
      throw new MeteredCallError(provenance, { cause: error });
    }
  }

  async function judgePointwise(
    input: JudgeClassifyInput,
  ): Promise<ClaimsJudgement> {
    if (isClaimRubric(input.spec)) {
      return checkClaims(input);
    }
    const result = await classify(input);
    return {
      provenance: result.provenance,
      rationale: result.reasons,
      score: input.spec.choiceScores[result.choice] ?? null,
      verdicts: null,
    };
  }

  return {
    async battle({
      first,
      judgeRegistryKey,
      row,
      second,
    }: BattleJudgeRequest): Promise<BattleJudgement> {
      try {
        const result = await classify({
          judgeRegistryKey,
          rowId: row.id,
          spec: BATTLE_RUBRIC,
          variables: {
            expected: second,
            instructions: row.input.prompt,
            output: first,
          },
        });
        const isFirstPreferred =
          (BATTLE_RUBRIC.choiceScores[result.choice] ?? 0) >= 0.5;

        return {
          callId: result.provenance.callId,
          failure: null,
          isFirstPreferred,
          rationale: result.reasons,
          vote: vote(judgeRegistryKey, result.provenance, {
            choice: isFirstPreferred ? 'a' : 'b',
            rationale: result.reasons,
            score: null,
          }),
        };
      } catch (error: unknown) {
        if (isFatal(error)) {
          throw error;
        }

        const failed = failedCall(error);
        return {
          callId: failed?.callId ?? null,
          failure: describe(error),
          isFirstPreferred: null,
          rationale: null,
          vote: vote(judgeRegistryKey, failed, {
            choice: null,
            rationale: null,
            score: null,
          }),
        };
      }
    },

    async pointwise({
      judgeRegistryKey,
      output,
      row,
    }: PointwiseJudgeRequest): Promise<PointwiseJudgement> {
      const spec = resolvePointwiseRubric(row.rubricVersion);
      try {
        const result = await judgePointwise({
          judgeRegistryKey,
          rowId: row.id,
          spec,
          variables: {
            guidance: row.input.brief.guidance ?? 'none',
            input: row.input.prompt,
            output,
          },
        });

        return {
          callId: result.provenance.callId,
          claimVerdicts: result.verdicts,
          failure: null,
          rationale: result.rationale,
          score: result.score,
          vote: vote(judgeRegistryKey, result.provenance, {
            choice: null,
            rationale: result.rationale,
            score: result.score,
          }),
        };
      } catch (error: unknown) {
        if (isFatal(error)) {
          throw error;
        }

        const failed = failedCall(error);
        return {
          callId: failed?.callId ?? null,
          claimVerdicts: null,
          failure: describe(error),
          rationale: null,
          score: null,
          vote: vote(judgeRegistryKey, failed, {
            choice: null,
            rationale: null,
            score: null,
          }),
        };
      }
    },

    rubrics(): RubricRecord[] {
      return [...usedRubrics.values()].map(toRubricRecord);
    },
  };
}
