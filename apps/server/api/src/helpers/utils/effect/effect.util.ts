import { Cause, Effect, Exit } from 'effect';

export function fromPromiseEffect<A>(
  operation: () => Promise<A> | A,
): Effect.Effect<A, unknown> {
  return Effect.tryPromise({
    catch: (cause) => cause,
    try: () => Promise.resolve(operation()),
  });
}

export async function runEffectPromise<A, E>(
  effect: Effect.Effect<A, E>,
): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  throw Cause.squash(exit.cause);
}
