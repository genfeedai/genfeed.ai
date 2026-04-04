import { AgentExecutionLaneService } from '@api/services/agent-threading/services/agent-execution-lane.service';
import { Effect } from 'effect';

describe('AgentExecutionLaneService', () => {
  it('serializes work submitted to the same lane', async () => {
    const service = new AgentExecutionLaneService();
    const order: string[] = [];
    let notifyFirstTaskStarted!: () => void;
    let releaseFirstTask!: () => void;
    const firstTaskStarted = new Promise<void>((resolve) => {
      notifyFirstTaskStarted = resolve;
    });

    const firstTask = service.runExclusive('thread-1', async () => {
      order.push('first:start');
      notifyFirstTaskStarted();
      await new Promise<void>((resolve) => {
        releaseFirstTask = resolve;
      });
      order.push('first:end');
      return 'first-result';
    });

    const secondTask = service.runExclusive('thread-1', async () => {
      order.push('second:start');
      return 'second-result';
    });

    await firstTaskStarted;
    expect(order).toEqual(['first:start']);

    releaseFirstTask();

    await expect(firstTask).resolves.toBe('first-result');
    await expect(secondTask).resolves.toBe('second-result');
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('allows different lanes to run independently', async () => {
    const service = new AgentExecutionLaneService();
    const order: string[] = [];

    await Promise.all([
      service.runExclusive('thread-1', async () => {
        order.push('lane-1');
      }),
      service.runExclusive('thread-2', async () => {
        order.push('lane-2');
      }),
    ]);

    expect(order.sort()).toEqual(['lane-1', 'lane-2']);
  });

  it('serializes work submitted to the same lane through runExclusiveEffect', async () => {
    const service = new AgentExecutionLaneService();
    const order: string[] = [];
    let notifyFirstTaskStarted!: () => void;
    let releaseFirstTask!: () => void;
    const firstTaskStarted = new Promise<void>((resolve) => {
      notifyFirstTaskStarted = resolve;
    });

    const firstTask = Effect.runPromise(
      service.runExclusiveEffect('thread-1', () =>
        Effect.promise(async () => {
          order.push('first:start');
          notifyFirstTaskStarted();
          await new Promise<void>((resolve) => {
            releaseFirstTask = resolve;
          });
          order.push('first:end');
          return 'first-result';
        }),
      ),
    );

    const secondTask = Effect.runPromise(
      service.runExclusiveEffect('thread-1', () =>
        Effect.succeed('second-result').pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              order.push('second:start');
            }),
          ),
        ),
      ),
    );

    await firstTaskStarted;
    expect(order).toEqual(['first:start']);

    releaseFirstTask();

    await expect(firstTask).resolves.toBe('first-result');
    await expect(secondTask).resolves.toBe('second-result');
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });
});
