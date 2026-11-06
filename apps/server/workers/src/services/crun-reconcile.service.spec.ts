import type { CrunContractImportService } from '@api/services/integrations/crun/contracts/crun-contract-import.service';
import type { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import type { CrunTaskFinalizationService } from '@api/services/integrations/crun/crun-task-finalization.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { CrunReconcileService } from '@workers/services/crun-reconcile.service';

interface TaskRow {
  id: string;
  mediaPersistedAt: Date | null;
  organizationId: string;
  state: string;
  version: number;
}

const row: TaskRow = {
  id: 'task',
  mediaPersistedAt: null,
  organizationId: 'org',
  state: 'provider-failed',
  version: 4,
};

interface Finalized {
  info: unknown;
  signal: AbortSignal;
  task: TaskRow;
}

function fixture() {
  // Every task-store call appends to one ordered log, so a test reads what
  // the pass did and in which order.
  const state = {
    claimed: [row] as TaskRow[],
    finalizeGate: undefined as Promise<void> | undefined,
    finalized: [] as Finalized[],
    isOwner: true,
    isSweepDown: false,
    log: [] as string[],
    pollResult: undefined as { info: unknown; task: TaskRow } | undefined,
    renewFailures: 0,
    warnings: [] as string[],
  };
  const tasks = {
    claimDue: async () => {
      state.log.push('claim');
      return state.claimed;
    },
    failStalePrepared: async () => {
      state.log.push('sweep');
      if (state.isSweepDown) {
        throw new Error('db down');
      }
      return 0;
    },
    ownsLease: async () => state.isOwner,
    poll: async (task: TaskRow) => {
      state.log.push(`poll:${task.id}`);
      return state.pollResult;
    },
    renewLease: async () => {
      state.log.push('renew');
      if (state.renewFailures > 0) {
        state.renewFailures -= 1;
        throw new Error('fixture outage');
      }
      return true;
    },
  };
  const finalizer = {
    finalize: async (task: TaskRow, info: unknown, signal: AbortSignal) => {
      state.finalized.push({ info, signal, task });
      await state.finalizeGate;
    },
  };
  const logger = {
    warn: (message: string) => {
      state.warnings.push(message);
    },
  };
  const service = new CrunReconcileService(
    tasks as unknown as CrunTaskService,
    finalizer as unknown as CrunTaskFinalizationService,
    {
      synchronize: async () => undefined,
    } as unknown as CrunContractImportService,
    logger as unknown as LoggerService,
  );
  return { service, state };
}

function gate() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('Crun shared worker ownership', () => {
  afterEach(() => vi.useRealTimers());

  it('drains accepted failure from durable proof without credential/status reads', async () => {
    const f = fixture();

    await f.service.reconcile();

    expect(f.state.log).toEqual(['sweep', 'claim']);
    expect(f.state.finalized).toEqual([
      { info: undefined, signal: expect.any(AbortSignal), task: row },
    ]);
  });

  it('fails abandoned prepared rows before claiming and survives a sweep error', async () => {
    const f = fixture();
    f.state.isSweepDown = true;

    await f.service.reconcile();

    expect(f.state.log).toEqual(['sweep', 'claim']);
    expect(f.state.warnings).toEqual(['Crun stale prepared sweep deferred']);
    expect(f.state.finalized).toHaveLength(1);
  });

  it('passes the terminal claimed epoch returned by poll to finalization', async () => {
    const f = fixture();
    f.state.claimed = [{ ...row, state: 'pending' }];
    const terminal = { ...row, state: 'provider-success' };
    f.state.pollResult = { info: { taskId: 'opaque' }, task: terminal };

    await f.service.reconcile();

    expect(f.state.log).toEqual(['sweep', 'claim', 'poll:task']);
    expect(f.state.finalized).toEqual([
      {
        info: { taskId: 'opaque' },
        signal: expect.any(AbortSignal),
        task: terminal,
      },
    ]);
  });

  it('renews during long finalization and clears timer on completion', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const finalization = gate();
    f.state.finalizeGate = finalization.promise;

    const run = f.service.reconcile();
    await vi.advanceTimersByTimeAsync(40000);
    expect(f.state.log).toEqual(['sweep', 'claim', 'renew', 'renew']);

    finalization.release();
    await run;
    await vi.advanceTimersByTimeAsync(60000);

    expect(f.state.log).toEqual(['sweep', 'claim', 'renew', 'renew']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('permanently aborts the effect signal after renewal fails even when ownership later recovers', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const finalization = gate();
    f.state.finalizeGate = finalization.promise;
    f.state.renewFailures = 1;

    const run = f.service.reconcile();
    await vi.advanceTimersByTimeAsync(20000);
    const signal = f.state.finalized[0]?.signal;
    expect(signal?.aborted).toBe(true);

    f.state.isOwner = true;
    finalization.release();
    await run;

    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not finalize a stale or lost ownership epoch', async () => {
    const f = fixture();
    f.state.isOwner = false;

    await f.service.reconcile();

    expect(f.state.finalized).toEqual([]);
  });
});
