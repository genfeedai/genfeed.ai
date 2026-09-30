import { randomUUID } from 'node:crypto';
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
  const organizationId = randomUUID();
  const firstApplication = `batch-review-${organizationId}-first`;
  const secondApplication = `batch-review-${organizationId}-second`;
  let first: BatchReviewLockService;
  let second: BatchReviewLockService;
  let observer: Client;
  beforeAll(async () => {
    const url = assertIsolatedDatabaseUrl();
    observer = new Client({ connectionString: url });
    await observer.connect();
    // The URL guard owns local/disposable isolation. A local Docker port
    // forwards to a bridge address, so inet_server_addr() is not loopback.
    const result = await observer.query('SELECT current_database() AS name');
    expect(result.rows[0].name).toBe(
      decodeURIComponent(new URL(url).pathname.slice(1)),
    );
    const config = (applicationName: string) => {
      const connectionUrl = new URL(url);
      connectionUrl.searchParams.set('application_name', applicationName);
      return {
        get: (key: string) =>
          key === 'DATABASE_URL' ? connectionUrl.toString() : undefined,
      };
    };
    first = new BatchReviewLockService(
      config(firstApplication) as never,
      { warn: vi.fn() } as never,
    );
    second = new BatchReviewLockService(
      config(secondApplication) as never,
      { warn: vi.fn() } as never,
    );
  });
  afterAll(async () => {
    await Promise.all([first?.onModuleDestroy(), second?.onModuleDestroy()]);
    await observer?.end();
  });
  afterEach(async () => {
    const locks = await observer.query(
      `SELECT COUNT(*)::int AS locks
       FROM pg_locks locks JOIN pg_stat_activity activity ON activity.pid = locks.pid
       WHERE locks.locktype = 'advisory' AND locks.granted
         AND activity.application_name IN ($1, $2)`,
      [firstApplication, secondApplication],
    );
    expect(locks.rows[0].locks).toBe(0);
  });
  it('serializes overlapping batches on one connection and unlocks after the complete operation', async () => {
    const entered = deferred();
    const release = deferred();
    const waiting = first.run(['b', 'a', 'b'], organizationId, async () => {
      entered.resolve();
      await release.promise;
    });
    let ran = false;
    let contender: Promise<void> | undefined;
    try {
      await entered.promise;
      contender = second.run(['a'], organizationId, async () => {
        ran = true;
      });
      // Observe a real attempted acquisition before asserting exclusion.
      // A fixed sleep can pass without the contender ever reaching Postgres.
      await expect
        .poll(async () => {
          const activity = await observer.query(
            `SELECT COUNT(*)::int AS sessions FROM pg_stat_activity
           WHERE application_name = $1 AND state = 'idle in transaction'
             AND query LIKE 'SELECT pg_try_advisory_xact_lock%'`,
            [secondApplication],
          );
          return activity.rows[0].sessions;
        })
        .toBe(1);
      expect(ran).toBe(false);
      const locks = await observer.query(
        `SELECT COUNT(DISTINCT locks.pid)::int AS sessions, COUNT(*)::int AS locks
         FROM pg_locks locks JOIN pg_stat_activity activity ON activity.pid = locks.pid
         WHERE locks.locktype = 'advisory' AND locks.granted
           AND activity.application_name IN ($1, $2)`,
        [firstApplication, secondApplication],
      );
      expect(locks.rows[0]).toEqual({ sessions: 1, locks: 2 });
    } finally {
      release.resolve();
      await Promise.all([waiting, contender]);
    }
    expect(ran).toBe(true);
  });
  it('releases every lock after a failed operation so another worker can recover', async () => {
    await expect(
      first.run(['b', 'a'], organizationId, async () => {
        throw new Error('schedule failed');
      }),
    ).rejects.toThrow('schedule failed');
    await expect(
      second.run(['a', 'b'], organizationId, async () => 'recovered'),
    ).resolves.toBe('recovered');
  });
  it.each([
    { batchId: 'c', organization: organizationId },
    { batchId: 'a', organization: `${organizationId}-other` },
  ])(
    'does not block an independent batch/organization: %j',
    async ({ batchId, organization }) => {
      const entered = deferred();
      const release = deferred();
      const holder = first.run(['a'], organizationId, async () => {
        entered.resolve();
        await release.promise;
      });
      try {
        await entered.promise;
        await expect(
          second.run([batchId], organization, async () => 'independent'),
        ).resolves.toBe('independent');
      } finally {
        release.resolve();
        await holder;
      }
    },
  );
});
