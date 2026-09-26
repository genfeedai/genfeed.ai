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
import type {
  BattleJudgement,
  BattleJudgeRequest,
  CallProvenance,
  EvalJudge,
  EvalJudgeOptions,
  EvalRubricSpec,
  JudgeClassifyInput,
  JudgeClassifyResult,
  JudgeVote,
  PointwiseJudgement,
  PointwiseJudgeRequest,
  RubricRecord,
} from '../contracts';
import { requireModelFamily } from '../families';
import { MeteredCallError, meteredCall } from '../provenance';
import { SpendCapExceededError } from '../spend';
import {
  BATTLE_RUBRIC,
  CONTENT_QUALITY_RUBRIC,
  RUBRICS_BY_VERSION,
  renderTemplate,
  rubricDigest,
  toRubricRecord,
} from './rubrics';

export const JUDGE_SCHEMA_NAME = 'content_eval_judge_classification';
const JUDGE_MAX_TOKENS = 1024;
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
    throw new Error(
      `Unknown pointwise rubric "${rubricVersion}"; known: ${CONTENT_QUALITY_RUBRIC.version}`,
    );
  }

  return spec;
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
        const result = await classify({
          judgeRegistryKey,
          rowId: row.id,
          spec,
          variables: {
            guidance: row.input.brief.guidance ?? 'none',
            input: row.input.prompt,
            output,
          },
        });
        const score = spec.choiceScores[result.choice] ?? null;

        return {
          callId: result.provenance.callId,
          failure: null,
          rationale: result.reasons,
          score,
          vote: vote(judgeRegistryKey, result.provenance, {
            choice: null,
            rationale: result.reasons,
            score,
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
