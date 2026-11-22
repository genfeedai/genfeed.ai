import {
  explore,
  type Simulation,
} from '@api-test/model-checking/interleaving-explorer';
import { describe, expect, it } from 'vitest';

function counter(sim: Simulation) {
  const state = { value: 0 };
  return {
    read: async () => {
      await sim.step('read counter');
      return state.value;
    },
    state,
    write: async (value: number) => {
      await sim.step('write counter');
      state.value = value;
    },
  };
}

describe('interleaving explorer', () => {
  it('finds the lost update of a read followed by a write', async () => {
    const result = await explore(() => {
      let store: ReturnType<typeof counter> | undefined;
      return {
        final: () =>
          store?.state.value === 2
            ? null
            : `two increments left the counter at ${store?.state.value}`,
        start: (sim) => {
          const shared = counter(sim);
          store = shared;
          for (const name of ['A', 'B']) {
            sim.spawn(name, async () => {
              shared.write((await shared.read()) + 1);
            });
          }
        },
      };
    });

    expect(result.violation?.message).toBe(
      'two increments left the counter at 1',
    );
    expect(result.violation?.trace).toEqual([
      'A: read counter',
      'B: read counter',
      'A: write counter',
      'B: write counter',
    ]);
  });

  it('passes when the update is one atomic step and counts every schedule', async () => {
    const result = await explore(() => {
      const state = { value: 0 };
      return {
        final: () => (state.value === 2 ? null : 'lost update'),
        start: (sim) => {
          for (const name of ['A', 'B']) {
            sim.spawn(name, async () => {
              await sim.step('increment');
              state.value += 1;
            });
          }
        },
      };
    });

    expect(result).toEqual({ schedules: 2, violation: null });
  });

  it('follows one schedule per distinct state when the scenario names its state', async () => {
    const build = (withSnapshot: boolean) => () => {
      const state = { done: [] as string[] };
      return {
        final: () => null,
        snapshot: withSnapshot
          ? () => JSON.stringify(state.done.sort())
          : undefined,
        start: (sim: Simulation) => {
          for (const name of ['A', 'B', 'C']) {
            sim.spawn(name, async () => {
              await sim.step('first');
              await sim.step('second');
              state.done.push(name);
            });
          }
        },
      };
    };

    const everyOrder = await explore(build(false));
    const distinctStates = await explore(build(true));

    expect(everyOrder.schedules).toBe(90);
    expect(distinctStates.schedules).toBeLessThan(everyOrder.schedules);
    expect(distinctStates.violation).toBeNull();
  });

  it('explores a crash at every step of a crashable actor', async () => {
    const reached: string[] = [];
    const result = await explore(() => ({
      final: () => {
        reached.push('done');
        return null;
      },
      start: (sim) => {
        sim.spawn(
          'A',
          async () => {
            await sim.step('first');
            await sim.step('second');
          },
          { crashable: true },
        );
      },
    }));

    // Run to the end, die before the first step, die before the second.
    expect(result.schedules).toBe(3);
    expect(reached).toHaveLength(3);
  });

  it('explores every outcome of a choice', async () => {
    const seen = new Set<string>();
    await explore(() => ({
      start: (sim) => {
        sim.spawn('A', async () => {
          seen.add(await sim.choose('handler', ['ok', 'fail']));
        });
      },
    }));

    expect([...seen].sort()).toEqual(['fail', 'ok']);
  });

  it('starts a redelivery only after every actor ended', async () => {
    const order: string[] = [];
    await explore(() => ({
      start: (sim) => {
        sim.spawn('A', async () => {
          await sim.step('work');
          order.push('A');
        });
        sim.onQuiescence(() => {
          sim.spawn('retry', async () => {
            order.push('retry');
          });
        });
      },
    }));

    expect(order).toEqual(['A', 'retry']);
  });

  it('reports an actor that can never proceed as a deadlock', async () => {
    const result = await explore(() => ({
      start: (sim) => {
        sim.spawn('A', () => new Promise<void>(() => undefined));
      },
    }));

    expect(result.violation?.message).toBe('deadlock: A cannot proceed');
  });

  it('refuses a search space beyond its bound instead of truncating it', async () => {
    await expect(
      explore(
        () => ({
          start: (sim) => {
            for (const name of ['A', 'B', 'C']) {
              sim.spawn(name, async () => {
                await sim.step('one');
                await sim.step('two');
              });
            }
          },
        }),
        { maxSchedules: 10 },
      ),
    ).rejects.toThrow('more than 10 schedules');
  });
});
