import {
  TypedDecisionRateLimitError,
  TypedDecisionTimeoutError,
} from '@api/services/typed-decisions/typed-decision.errors';
import { TypedDecisionTelemetryService } from '@api/services/typed-decisions/typed-decision-telemetry.service';
import {
  NULL_TYPED_DECISION_PROVIDER_NAME,
  TYPED_DECISION_DEFAULT_TIMEOUT_MS,
  TYPED_DECISION_MAX_OPTIONS,
} from '@api/services/typed-decisions/typed-decisions.constants';
import { TYPED_DECISION_PROVIDER } from '@api/services/typed-decisions/typed-decisions.tokens';
import type {
  TypedDecisionAnswer,
  TypedDecisionBooleanParams,
  TypedDecisionCallContext,
  TypedDecisionChoiceParams,
  TypedDecisionDeterministicAnswer,
  TypedDecisionFailureReason,
  TypedDecisionKind,
  TypedDecisionProvider,
  TypedDecisionScoreParams,
  TypedDecisionTelemetryRecord,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';

type TypedDecisionValueGuard<TValue> = (value: unknown) => value is TValue;

function isFiniteScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isCalibratedConfidence(confidence: unknown): confidence is number {
  return (
    typeof confidence === 'number' &&
    Number.isFinite(confidence) &&
    confidence >= 0 &&
    confidence <= 1
  );
}

/**
 * The one entry point for typed decisions (#4864).
 *
 * Contract with every call site:
 * - it resolves `null` for anything that is not a well-formed answer — an
 *   unconfigured provider, a timeout, a thrown error, a malformed response;
 * - `null` and a sub-threshold confidence mean the same thing: take the
 *   deterministic path;
 * - it never throws for provider health, so no decision can fail a request.
 *
 * The single exception is a programming error at the call site: a choice with
 * no options or more than TYPED_DECISION_MAX_OPTIONS of them, or a score scale
 * with fewer than two levels, throws BadRequestException instead of silently
 * degrading.
 */
@Injectable()
export class TypedDecisionService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    @Inject(TYPED_DECISION_PROVIDER)
    private readonly provider: TypedDecisionProvider,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    @Optional()
    private readonly telemetry?: TypedDecisionTelemetryService,
  ) {}

  async choose<TOption extends string>(
    params: TypedDecisionChoiceParams<TOption>,
    context: TypedDecisionCallContext,
  ): Promise<TypedDecisionAnswer<TOption> | null> {
    this.assertBoundedOptions(params.options, context.decisionPoint);

    const isOption = (value: unknown): value is TOption =>
      typeof value === 'string' &&
      params.options.some((option) => option === value);

    return this.run(
      'choice',
      context,
      (signal) => this.provider.choose(params, { signal }),
      isOption,
    );
  }

  async score(
    params: TypedDecisionScoreParams,
    context: TypedDecisionCallContext,
  ): Promise<TypedDecisionAnswer<number> | null> {
    if (params.scale !== undefined) {
      this.assertBoundedScale(params.scale, context.decisionPoint);
    }

    return this.run(
      'score',
      context,
      (signal) => this.provider.score(params, { signal }),
      isFiniteScore,
    );
  }

  async decide(
    params: TypedDecisionBooleanParams,
    context: TypedDecisionCallContext,
  ): Promise<TypedDecisionAnswer<boolean> | null> {
    return this.run(
      'boolean',
      context,
      (signal) => this.provider.decide(params, { signal }),
      isBoolean,
    );
  }

  private async run<TValue extends TypedDecisionDeterministicAnswer>(
    kind: TypedDecisionKind,
    context: TypedDecisionCallContext,
    execute: (
      signal: AbortSignal,
    ) => Promise<TypedDecisionAnswer<TValue> | null>,
    isValue: TypedDecisionValueGuard<TValue>,
  ): Promise<TypedDecisionAnswer<TValue> | null> {
    // Self-host with no provider: no timer, no telemetry, no network call.
    if (this.provider.name === NULL_TYPED_DECISION_PROVIDER_NAME) {
      return null;
    }

    const timeoutMs = this.resolveTimeoutMs(context);
    const startedAt = Date.now();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const answer = await Promise.race([
        execute(controller.signal),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            // Abort first so the in-flight request stops costing money.
            controller.abort();
            reject(new TypedDecisionTimeoutError(timeoutMs));
          }, timeoutMs);
        }),
      ]);

      if (answer === null) {
        this.record(kind, context, startedAt, { failureReason: 'unavailable' });
        return null;
      }

      if (
        !isValue(answer.value) ||
        !isCalibratedConfidence(answer.confidence)
      ) {
        this.warn(context, 'returned a malformed answer', timeoutMs);
        this.record(kind, context, startedAt, {
          failureReason: 'malformed',
          usage: answer.usage,
        });
        return null;
      }

      this.record(kind, context, startedAt, {
        answer: answer.value,
        confidence: answer.confidence,
        usage: answer.usage,
      });
      return answer;
    } catch (error: unknown) {
      return this.handleFailure(kind, context, startedAt, timeoutMs, error);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private handleFailure<TValue>(
    kind: TypedDecisionKind,
    context: TypedDecisionCallContext,
    startedAt: number,
    timeoutMs: number,
    error: unknown,
  ): TypedDecisionAnswer<TValue> | null {
    const isTimeout = error instanceof TypedDecisionTimeoutError;
    const isRateLimited = error instanceof TypedDecisionRateLimitError;
    const failureReason: TypedDecisionFailureReason = isTimeout
      ? 'timeout'
      : isRateLimited
        ? 'rate_limited'
        : 'error';

    this.warn(context, `failed (${failureReason})`, timeoutMs, error);
    this.record(kind, context, startedAt, {
      failureReason,
      ...(isRateLimited ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
    });

    return null;
  }

  /** One warn per failed call; never the state or the question. */
  private warn(
    context: TypedDecisionCallContext,
    summary: string,
    timeoutMs: number,
    error?: unknown,
  ): void {
    this.logger.warn(
      `${this.constructorName} ${context.decisionPoint} ${summary}`,
      {
        decisionPoint: context.decisionPoint,
        provider: this.provider.name,
        timeoutMs,
        ...(error === undefined ? {} : { error }),
      },
    );
  }

  private record(
    kind: TypedDecisionKind,
    context: TypedDecisionCallContext,
    startedAt: number,
    outcome: Partial<TypedDecisionTelemetryRecord>,
  ): void {
    this.telemetry?.record({
      brandId: context.brandId,
      decisionPoint: context.decisionPoint,
      deterministicAnswer: context.deterministicAnswer,
      kind,
      latencyMs: Date.now() - startedAt,
      // A call site that does not declare its mode is acting on the answer.
      mode: context.mode ?? 'live',
      organizationId: context.organizationId,
      provider: this.provider.name,
      runId: context.runId,
      threadId: context.threadId,
      userId: context.userId,
      ...outcome,
    });
  }

  private assertBoundedOptions(
    options: readonly string[],
    decisionPoint: string,
  ): void {
    if (options.length === 0) {
      throw new BadRequestException(
        `Typed decision "${decisionPoint}" was given no options`,
      );
    }

    if (options.length > TYPED_DECISION_MAX_OPTIONS) {
      throw new BadRequestException(
        `Typed decision "${decisionPoint}" was given ${options.length} options; the maximum is ${TYPED_DECISION_MAX_OPTIONS}`,
      );
    }
  }

  private assertBoundedScale(
    scale: readonly string[],
    decisionPoint: string,
  ): void {
    if (scale.length < 2) {
      throw new BadRequestException(
        `Typed decision "${decisionPoint}" was given a score scale with ${scale.length} levels; at least 2 are required`,
      );
    }

    if (scale.length > TYPED_DECISION_MAX_OPTIONS) {
      throw new BadRequestException(
        `Typed decision "${decisionPoint}" was given a score scale with ${scale.length} levels; the maximum is ${TYPED_DECISION_MAX_OPTIONS}`,
      );
    }
  }

  private resolveTimeoutMs(context: TypedDecisionCallContext): number {
    if (context.timeoutMs !== undefined && context.timeoutMs > 0) {
      return context.timeoutMs;
    }

    const configured = Number(
      this.configService.get('TYPED_DECISION_TIMEOUT_MS'),
    );

    return Number.isFinite(configured) && configured > 0
      ? configured
      : TYPED_DECISION_DEFAULT_TIMEOUT_MS;
  }
}
