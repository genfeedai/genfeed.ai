import { Injectable } from '@nestjs/common';
import { Cause, Effect, Exit } from 'effect';

type LaneTask<T> = () => Promise<T>;
type LaneEffectTask<A, E, R = never> = () => Effect.Effect<A, E, R>;

@Injectable()
export class AgentExecutionLaneService {
  private readonly lanes = new Map<string, Promise<unknown>>();

  runExclusiveEffect<A, E, R = never>(
    laneKey: string,
    task: LaneEffectTask<A, E, R>,
  ): Effect.Effect<A, E, R> {
    return Effect.async<A, E, R>((resume) => {
      const previous = this.lanes.get(laneKey) ?? Promise.resolve();

      let releaseCurrentLane: (() => void) | undefined;
      const current = new Promise<void>((resolve) => {
        releaseCurrentLane = resolve;
      });

      const next = previous.catch(() => undefined).then(() => current);

      this.lanes.set(laneKey, next);

      const runner = previous
        .catch(() => undefined)
        .then(() => Effect.runPromiseExit(task() as Effect.Effect<A, E, never>))
        .then((exit) => {
          resume(exit);
        })
        .finally(() => {
          releaseCurrentLane?.();

          if (this.lanes.get(laneKey) === next) {
            this.lanes.delete(laneKey);
          }
        });

      return Effect.sync(() => {
        void runner;
      });
    });
  }

  async runExclusive<T>(laneKey: string, task: LaneTask<T>): Promise<T> {
    const exit = await Effect.runPromiseExit(
      this.runExclusiveEffect(laneKey, () =>
        Effect.tryPromise({
          catch: (cause) => cause,
          try: () => task(),
        }),
      ),
    );

    if (Exit.isSuccess(exit)) {
      return exit.value;
    }

    throw Cause.squash(exit.cause);
  }
}
