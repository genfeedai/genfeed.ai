import { BatchReviewLockService } from '@api/services/batch-generation/batch-review-lock';
import { Client } from 'pg';
import { assertIsolatedDatabaseUrl } from '../../scripts/assert-isolated-db-url';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Batch review advisory transactions (real Postgres)', () => {
  let first: BatchReviewLockService;
  let second: BatchReviewLockService;
  let observer: Client;
  beforeAll(async () => {
    const url = assertIsolatedDatabaseUrl();
    observer = new Client({ connectionString: url });
    await observer.connect();
    const result = await observer.query(
      'SELECT host(inet_server_addr()) AS host, current_database() AS name',
    );
    expect(['127.0.0.1', '::1']).toContain(result.rows[0].host);
    expect(result.rows[0].name).toMatch(/test/i);
    const config = {
      get: (key: string) => (key === 'DATABASE_URL' ? url : undefined),
    };
    first = new BatchReviewLockService(
      config as never,
      { warn: vi.fn() } as never,
    );
    second = new BatchReviewLockService(
      config as never,
      { warn: vi.fn() } as never,
    );
  });
  afterAll(async () => {
    await Promise.all([first?.onModuleDestroy(), second?.onModuleDestroy()]);
    await observer?.end();
  });
  it('serializes overlapping batches on one connection and unlocks after the complete operation', async () => {
    const entered = deferred();
    const release = deferred();
    const waiting = first.run(['b', 'a'], 'org-test', async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    let ran = false;
    const contender = second.run(['a'], 'org-test', async () => {
      ran = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(ran).toBe(false);
    const locks = await observer.query(
      "SELECT COUNT(DISTINCT pid)::int AS sessions, COUNT(*)::int AS locks FROM pg_locks WHERE locktype = 'advisory' AND granted",
    );
    expect(locks.rows[0]).toEqual({ sessions: 1, locks: 2 });
    release.resolve();
    await Promise.all([waiting, contender]);
    expect(ran).toBe(true);
  });
  it('releases every lock after a failed operation so another worker can recover', async () => {
    await expect(
      first.run(['b', 'a'], 'org-test', async () => {
        throw new Error('schedule failed');
      }),
    ).rejects.toThrow('schedule failed');
    await expect(
      second.run(['a', 'b'], 'org-test', async () => 'recovered'),
    ).resolves.toBe('recovered');
  });
});
