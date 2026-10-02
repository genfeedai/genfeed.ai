import { CrunReconcileService } from '@workers/services/crun-reconcile.service';

const row = {
  id: 'task',
  organizationId: 'org',
  state: 'provider-failed',
  mediaPersistedAt: null,
  version: 4,
};
function fixture() {
  const tasks = {
    claimDue: vi.fn().mockResolvedValue([row]),
    poll: vi.fn(),
    renewLease: vi.fn().mockResolvedValue(true),
    ownsLease: vi.fn().mockResolvedValue(true),
  };
  const finalizer = { finalize: vi.fn().mockResolvedValue(undefined) };
  const importer = { synchronize: vi.fn() };
  const logger = { warn: vi.fn() };
  return {
    tasks,
    finalizer,
    importer,
    logger,
    service: new CrunReconcileService(
      tasks as never,
      finalizer as never,
      importer as never,
      logger as never,
    ),
  };
}
describe('Crun shared worker ownership', () => {
  afterEach(() => vi.useRealTimers());
  it('drains accepted failure from durable proof without credential/status reads', async () => {
    const f = fixture();
    await f.service.reconcile();
    expect(f.tasks.poll).not.toHaveBeenCalled();
    expect(f.finalizer.finalize).toHaveBeenCalledWith(
      row,
      undefined,
      expect.any(AbortSignal),
    );
  });
  it('passes the terminal claimed epoch returned by poll to finalization', async () => {
    const f = fixture();
    f.tasks.claimDue.mockResolvedValue([{ ...row, state: 'pending' }]);
    const terminal = { ...row, state: 'provider-success' };
    const info = { taskId: 'opaque' };
    f.tasks.poll.mockResolvedValue({ task: terminal, info });
    await f.service.reconcile();
    expect(f.finalizer.finalize).toHaveBeenCalledWith(
      terminal,
      info,
      expect.any(AbortSignal),
    );
  });
  it('renews during long finalization and clears timer on completion', async () => {
    vi.useFakeTimers();
    const f = fixture();
    let release: () => void = () => undefined;
    f.finalizer.finalize.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const run = f.service.reconcile();
    await vi.advanceTimersByTimeAsync(40000);
    expect(f.tasks.renewLease).toHaveBeenCalledTimes(2);
    release();
    await run;
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.tasks.renewLease).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('permanently aborts the effect signal after renewal fails even when ownership later recovers', async () => {
    vi.useFakeTimers();
    const f = fixture();
    let signal: AbortSignal | undefined;
    let release: () => void = () => undefined;
    f.finalizer.finalize.mockImplementation((_task, _info, supplied) => {
      signal = supplied;
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    f.tasks.renewLease.mockRejectedValueOnce(new Error('fixture outage'));
    const run = f.service.reconcile();
    await vi.advanceTimersByTimeAsync(20000);
    expect(signal?.aborted).toBe(true);
    f.tasks.ownsLease.mockResolvedValue(true);
    release();
    await run;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not finalize a stale or lost ownership epoch', async () => {
    const f = fixture();
    f.tasks.ownsLease.mockResolvedValue(false);
    await f.service.reconcile();
    expect(f.finalizer.finalize).not.toHaveBeenCalled();
  });
});
