import { describe, expect, it } from 'vitest';
import {
  createProductionTurnCleanup,
  type ProductionTurnCleanupPlan,
} from './proactive-agent-production-turn-cleanup.util';

function fixture() {
  const calls: string[] = [];
  const cleanup = createProductionTurnCleanup();
  const step = (name: string) => () => {
    calls.push(name);
  };
  const plan: ProductionTurnCleanupPlan = {
    beforeStop: [step('barriers'), step('dispatches')],
    closeHandles: [step('events'), step('queues')],
    disposeOwned: [step('namespace'), step('database')],
    restoreGuards: [step('transport'), step('environment')],
  };
  return { calls, cleanup, plan, step };
}
function errorList(error: unknown): unknown[] {
  expect(error).toBeInstanceOf(AggregateError);
  return error instanceof AggregateError ? error.errors : [];
}

describe('production turn writer ownership cleanup', () => {
  it('cleans resources before construction without inventing a writer', async () => {
    const f = fixture();
    await f.cleanup.close(f.plan);
    expect(f.calls).toEqual([
      'barriers',
      'dispatches',
      'events',
      'queues',
      'namespace',
      'database',
      'transport',
      'environment',
    ]);
  });
  it('proves real stop before disposal and performs repeated close once', async () => {
    const f = fixture();
    f.cleanup.beginConstruction();
    f.cleanup.registerWriterStop(f.step('writer'));
    const first = f.cleanup.close(f.plan);
    expect(f.cleanup.close(f.plan)).toBe(first);
    await first;
    expect(f.calls).toEqual([
      'barriers',
      'dispatches',
      'writer',
      'events',
      'queues',
      'namespace',
      'database',
      'transport',
      'environment',
    ]);
  });
  it('refuses destruction and guard restoration after partial compilation', async () => {
    const f = fixture();
    f.cleanup.beginConstruction();
    const errors = await f.cleanup.close(f.plan).catch(errorList);
    expect(errors).toEqual([
      expect.objectContaining({ code: 'PRODUCTION_TURN_WRITERS_UNPROVEN' }),
    ]);
    expect(f.calls).toEqual(['barriers', 'dispatches', 'events', 'queues']);
    expect(() => f.cleanup.registerWriterStop(f.step('late'))).toThrow();
  });
  it('retains the real stop and handle errors without disposing unproven resources', async () => {
    const f = fixture();
    const stop = new Error('stop failed');
    const handle = new Error('handle failed');
    f.cleanup.beginConstruction();
    f.cleanup.registerWriterStop(() => {
      f.calls.push('writer');
      throw stop;
    });
    f.plan.closeHandles = [
      () => {
        f.calls.push('bad-handle');
        throw handle;
      },
      f.step('next-handle'),
    ];
    const errors = await f.cleanup.close(f.plan).catch(errorList);
    expect(errors).toEqual([
      stop,
      expect.objectContaining({ code: 'PRODUCTION_TURN_WRITERS_UNPROVEN' }),
      handle,
    ]);
    expect(f.calls).toEqual([
      'barriers',
      'dispatches',
      'writer',
      'bad-handle',
      'next-handle',
    ]);
  });
  it('observes dispatch failure then stops writers and attempts owned disposal', async () => {
    const f = fixture();
    const failure = new Error('dispatch rejected');
    f.cleanup.beginConstruction();
    f.cleanup.registerWriterStop(f.step('writer'));
    f.plan.beforeStop = [
      () => {
        throw failure;
      },
      f.step('drained'),
    ];
    expect(await f.cleanup.close(f.plan).catch(errorList)).toEqual([failure]);
    expect(f.calls).toEqual([
      'drained',
      'writer',
      'events',
      'queues',
      'namespace',
      'database',
    ]);
  });
  it('attempts independent disposals after a failure and retains guards', async () => {
    const f = fixture();
    const failure = new Error('dispose failed');
    f.plan.disposeOwned = [
      () => {
        f.calls.push('bad-dispose');
        throw failure;
      },
      f.step('next-dispose'),
    ];
    expect(await f.cleanup.close(f.plan).catch(errorList)).toEqual([failure]);
    expect(f.calls).toEqual([
      'barriers',
      'dispatches',
      'events',
      'queues',
      'bad-dispose',
      'next-dispose',
    ]);
  });
  it('attempts later handles and proven disposal after a handle fails', async () => {
    const f = fixture();
    const failure = new Error('handle failed');
    f.plan.closeHandles = [
      () => {
        throw failure;
      },
      f.step('next-handle'),
    ];
    expect(await f.cleanup.close(f.plan).catch(errorList)).toEqual([failure]);
    expect(f.calls).toEqual([
      'barriers',
      'dispatches',
      'next-handle',
      'namespace',
      'database',
    ]);
  });
  it('reports guard restoration failure after attempting later restorations', async () => {
    const f = fixture();
    const failure = new Error('restore failed');
    f.plan.restoreGuards = [
      () => {
        throw failure;
      },
      f.step('next-restore'),
    ];
    expect(await f.cleanup.close(f.plan).catch(errorList)).toEqual([failure]);
    expect(f.calls.at(-1)).toBe('next-restore');
  });
  it('rejects invalid or duplicate construction ownership transitions', async () => {
    const f = fixture();
    expect(() => f.cleanup.registerWriterStop(f.step('writer'))).toThrow();
    f.cleanup.beginConstruction();
    expect(() => f.cleanup.beginConstruction()).toThrow();
    f.cleanup.registerWriterStop(f.step('writer'));
    expect(() => f.cleanup.registerWriterStop(f.step('other'))).toThrow();
    await f.cleanup.close(f.plan);
    expect(() => f.cleanup.beginConstruction()).toThrow();
  });
  it('preserves the primary object ahead of complete cleanup failure evidence', async () => {
    const f = fixture();
    const primary = { cause: 'original setup error' };
    f.cleanup.beginConstruction();
    const outer = await (async () => {
      try {
        throw primary;
      } catch (error) {
        try {
          await f.cleanup.close(f.plan);
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'setup and cleanup failed',
          );
        }
        throw error;
      }
    })().catch(errorList);
    expect(outer?.[0]).toBe(primary);
    expect(errorList(outer?.[1])).toEqual([
      expect.objectContaining({ code: 'PRODUCTION_TURN_WRITERS_UNPROVEN' }),
    ]);
  });
});
