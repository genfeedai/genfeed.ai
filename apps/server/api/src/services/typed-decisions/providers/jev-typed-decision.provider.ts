import {
  JEV_QUESTION_KEY,
  JEV_RETENTION_POLICY,
  JEV_SCORE_MAX,
  JEV_SCORE_MIN,
  JEV_SYSTEM_ONE_MODEL,
  JEV_SYSTEM_ONE_URL,
  type JevAnswer,
  type JevQuestion,
  type JevSystemOneRequest,
} from '@api/services/typed-decisions/interfaces/jev-system-one.interface';
import { TypedDecisionRateLimitError } from '@api/services/typed-decisions/typed-decision.errors';
import { JEV_TYPED_DECISION_PROVIDER_NAME } from '@api/services/typed-decisions/typed-decisions.constants';
import type {
  TypedDecisionAnswer,
  TypedDecisionBooleanParams,
  TypedDecisionChoiceParams,
  TypedDecisionProvider,
  TypedDecisionProviderCallOptions,
  TypedDecisionScoreParams,
  TypedDecisionUsage,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Injectable } from '@nestjs/common';

const JEV_ORIGIN = new URL(JEV_SYSTEM_ONE_URL).origin;

const DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS = 60;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function asProbability(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(value, 1)
    : undefined;
}

function asPositiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

/**
 * `retry-after` is either delta-seconds or an HTTP date. Anything else — or a
 * missing header — falls back to a conservative fixed cooldown rather than
 * hammering a vendor that just asked us to stop.
 */
function parseRetryAfterSeconds(header: string | null): number {
  if (!header) {
    return DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS;
  }

  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds);
  }

  const retryAt = Date.parse(header);
  if (Number.isFinite(retryAt)) {
    const delta = Math.ceil((retryAt - Date.now()) / 1000);
    return delta > 0 ? delta : DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS;
  }

  return DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS;
}

/** Reads the `usage` envelope defensively; absent fields bill as zero. */
function parseUsage(usage: UnknownRecord | undefined): TypedDecisionUsage {
  const costMicros = usage?.cost_micros;
  return {
    inputTokens: asPositiveInteger(usage?.input_tokens),
    model: JEV_SYSTEM_ONE_MODEL,
    outputTokens: asPositiveInteger(usage?.output_tokens),
    ...(typeof costMicros === 'number' && Number.isFinite(costMicros)
      ? { vendorCostMicros: Math.max(0, Math.round(costMicros)) }
      : {}),
  };
}

interface JevEvaluation {
  answer: JevAnswer;
  usage: TypedDecisionUsage;
}

/**
 * TypeSafe AI "System One" (Jev) adapter (#4864).
 *
 * The wire shapes it speaks are UNVERIFIED — see the header of
 * `interfaces/jev-system-one.interface.ts`. Every response field is validated
 * before it becomes an answer, so a shape mismatch resolves to `null` (the
 * deterministic path) instead of a wrong decision.
 *
 * The adapter never retries inside the request budget: on 429 it records the
 * cooldown the vendor asked for and fails fast until it expires, so a rate
 * limit costs one request, not a burst.
 */
@Injectable()
export class JevTypedDecisionProvider implements TypedDecisionProvider {
  readonly name = JEV_TYPED_DECISION_PROVIDER_NAME;

  private readonly constructorName = String(this.constructor.name);

  private cooldownUntilMs = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  async choose<TOption extends string>(
    params: TypedDecisionChoiceParams<TOption>,
    options?: TypedDecisionProviderCallOptions,
  ): Promise<TypedDecisionAnswer<TOption> | null> {
    const evaluation = await this.evaluate(
      {
        options: [...params.options],
        question: params.question,
        type: 'choice',
      },
      params.state,
      options,
    );

    if (!evaluation) {
      return null;
    }

    const { answer, usage } = evaluation;
    if (answer.type !== 'choice') {
      return null;
    }

    const confidence = asProbability(answer.confidence);
    // An off-menu option is a malformed answer, never a silent coercion.
    const value = params.options.find((option) => option === answer.choice);
    if (confidence === undefined || value === undefined) {
      return null;
    }

    return { confidence, usage, value };
  }

  async score(
    params: TypedDecisionScoreParams,
    options?: TypedDecisionProviderCallOptions,
  ): Promise<TypedDecisionAnswer<number> | null> {
    const evaluation = await this.evaluate(
      {
        max: JEV_SCORE_MAX,
        min: JEV_SCORE_MIN,
        question: params.question,
        type: 'score',
      },
      params.state,
      options,
    );

    if (!evaluation) {
      return null;
    }

    const { answer, usage } = evaluation;
    if (answer.type !== 'score') {
      return null;
    }

    const confidence = asProbability(answer.confidence);
    const value = asProbability(answer.score);
    if (confidence === undefined || value === undefined) {
      return null;
    }

    return { confidence, usage, value };
  }

  async decide(
    params: TypedDecisionBooleanParams,
    options?: TypedDecisionProviderCallOptions,
  ): Promise<TypedDecisionAnswer<boolean> | null> {
    const evaluation = await this.evaluate(
      { question: params.question, type: 'noul' },
      params.state,
      options,
    );

    if (!evaluation) {
      return null;
    }

    const { answer, usage } = evaluation;
    if (answer.type !== 'noul') {
      return null;
    }

    const probability = asProbability(answer.noul);
    if (probability === undefined) {
      return null;
    }

    // A noul answer carries no separate confidence: the distance of the
    // probability from the coin flip is the confidence.
    return {
      confidence: Math.max(probability, 1 - probability),
      usage,
      value: probability >= 0.5,
    };
  }

  private async evaluate(
    question: JevQuestion,
    state: Record<string, unknown>,
    options?: TypedDecisionProviderCallOptions,
  ): Promise<JevEvaluation | null> {
    this.assertNotCoolingDown();

    const body: JevSystemOneRequest = {
      model: JEV_SYSTEM_ONE_MODEL,
      questions: { [JEV_QUESTION_KEY]: question },
      state,
      ...JEV_RETENTION_POLICY,
    };

    const response = await safeFetch(
      JEV_SYSTEM_ONE_URL,
      {
        body: JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${this.resolveApiKey()}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        ...(options?.signal ? { signal: options.signal } : {}),
      },
      { allowedOrigins: [JEV_ORIGIN] },
    );

    if (response.status === 429) {
      throw this.enterCooldown(response.headers.get('retry-after'));
    }

    if (!response.ok) {
      throw new Error(
        `TypeSafe System One responded with ${response.status} ${response.statusText}`,
      );
    }

    return this.parseEvaluation(await response.json());
  }

  private parseEvaluation(payload: unknown): JevEvaluation | null {
    const envelope = asRecord(payload);
    const answers = asRecord(envelope?.answers);
    const answer = asRecord(answers?.[JEV_QUESTION_KEY]);
    const type = answer?.type;

    if (type !== 'choice' && type !== 'noul' && type !== 'score') {
      return null;
    }

    const usage = parseUsage(asRecord(envelope?.usage));

    if (type === 'choice') {
      const choice = answer?.choice;
      return typeof choice === 'string'
        ? {
            answer: {
              choice,
              confidence: Number(answer?.confidence),
              type,
            },
            usage,
          }
        : null;
    }

    if (type === 'score') {
      return {
        answer: {
          confidence: Number(answer?.confidence),
          score: Number(answer?.score),
          type,
        },
        usage,
      };
    }

    return { answer: { noul: Number(answer?.noul), type }, usage };
  }

  private assertNotCoolingDown(): void {
    if (this.cooldownUntilMs <= Date.now()) {
      return;
    }

    throw new TypedDecisionRateLimitError(
      Math.ceil((this.cooldownUntilMs - Date.now()) / 1000),
    );
  }

  private enterCooldown(
    retryAfter: string | null,
  ): TypedDecisionRateLimitError {
    const retryAfterSeconds = parseRetryAfterSeconds(retryAfter);
    this.cooldownUntilMs = Date.now() + retryAfterSeconds * 1000;
    this.loggerService.warn(
      `${this.constructorName} rate limited by TypeSafe System One`,
      { retryAfterSeconds },
    );
    return new TypedDecisionRateLimitError(retryAfterSeconds);
  }

  private resolveApiKey(): string {
    const apiKey = String(
      this.configService.get('TYPESAFE_API_KEY') || '',
    ).trim();
    if (!apiKey) {
      throw new Error('TYPESAFE_API_KEY is not configured');
    }

    return apiKey;
  }
}
