import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Cause, Data, Effect, Exit } from 'effect';

/**
 * Tagged error for service-layer failures within the Effect boundary.
 *
 * Carries enough context to be converted into an appropriate NestJS
 * HTTP exception when the Effect is executed back into a Promise.
 */
export class EffectServiceError extends Data.TaggedError('EffectServiceError')<{
  readonly message: string;
  readonly code?: string;
  readonly status?: number;
  readonly cause?: unknown;
}> {}

/**
 * Run an Effect and return a Promise, converting Effect failures into
 * NestJS HTTP exceptions.
 *
 * This is the primary exit ramp from Effect-native code back to the
 * Nest controller / Promise boundary. It inspects the squashed cause
 * and maps known error shapes to the appropriate `HttpException` subclass.
 *
 * @example
 * ```ts
 * async findThread(threadId: string, orgId: string): Promise<ThreadDocument> {
 *   return runEffectAsPromise(
 *     this.findThreadEffect(threadId, orgId),
 *   );
 * }
 * ```
 */
export async function runEffectAsPromise<A, E>(
  effect: Effect.Effect<A, E, never>,
): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  const squashed = Cause.squash(exit.cause);

  if (squashed instanceof HttpException) {
    throw squashed;
  }

  if (squashed instanceof EffectServiceError) {
    throw mapServiceErrorToHttpException(squashed);
  }

  if (squashed instanceof Error) {
    throw new InternalServerErrorException(squashed.message);
  }

  throw new InternalServerErrorException('An unexpected error occurred');
}

/**
 * Wrap a Promise-returning function as an Effect.
 *
 * This is the primary on-ramp from existing Promise-based service calls
 * (Mongoose queries, external API calls, etc.) into Effect composition.
 *
 * The resulting Effect fails with `EffectServiceError` when the Promise
 * rejects, preserving the original error as the `cause` field.
 *
 * @example
 * ```ts
 * const findByIdEffect = promiseToEffect(
 *   () => this.model.findById(id).exec(),
 *   'Thread not found',
 * );
 * ```
 */
export function promiseToEffect<A>(
  promise: () => Promise<A>,
  errorMessage?: string,
): Effect.Effect<A, EffectServiceError, never> {
  return Effect.tryPromise({
    catch: (cause) =>
      new EffectServiceError({
        cause,
        message:
          errorMessage ??
          (cause instanceof Error ? cause.message : 'Promise rejected'),
      }),
    try: promise,
  });
}

/**
 * Wrap a synchronous function as an Effect.
 *
 * Useful for operations that may throw (JSON parsing, validation, etc.)
 * where you want the failure captured inside the Effect channel.
 *
 * @example
 * ```ts
 * const parsed = trySync(() => JSON.parse(raw), 'Invalid JSON payload');
 * ```
 */
export function trySync<A>(
  fn: () => A,
  errorMessage?: string,
): Effect.Effect<A, EffectServiceError, never> {
  return Effect.try({
    catch: (cause) =>
      new EffectServiceError({
        cause,
        message:
          errorMessage ??
          (cause instanceof Error ? cause.message : 'Sync operation failed'),
      }),
    try: fn,
  });
}

/**
 * Create an Effect that fails with a not-found error.
 *
 * @example
 * ```ts
 * pipe(
 *   promiseToEffect(() => this.model.findById(id).exec()),
 *   Effect.flatMap((doc) =>
 *     doc ? Effect.succeed(doc) : failNotFound('Thread', id),
 *   ),
 * );
 * ```
 */
export function failNotFound(
  entity: string,
  id?: string,
): Effect.Effect<never, EffectServiceError, never> {
  const detail = id ? `${entity} ${id} not found` : `${entity} not found`;
  return Effect.fail(
    new EffectServiceError({
      code: 'NOT_FOUND',
      message: detail,
      status: 404,
    }),
  );
}

/**
 * Create an Effect that fails with a bad-request error.
 */
export function failBadRequest(
  message: string,
): Effect.Effect<never, EffectServiceError, never> {
  return Effect.fail(
    new EffectServiceError({
      code: 'BAD_REQUEST',
      message,
      status: 400,
    }),
  );
}

function mapServiceErrorToHttpException(
  error: EffectServiceError,
): HttpException {
  const status = error.status ?? 500;

  switch (status) {
    case 400:
      return new BadRequestException(error.message);
    case 404:
      return new NotFoundException(error.message);
    default:
      return new InternalServerErrorException(error.message);
  }
}
