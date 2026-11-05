import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { Pool } from 'pg';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { TurboRunReviewLockService } from './turbo-run-review-lock';

// Explicit opt-in only: a disposable database, never DATABASE_URL. Advisory
// locks need no schema, so the shared migrated test database is enough.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

/**
 * Turbo run review locks against real PostgreSQL advisory locks: a review
 * holds its runs until it finishes, other reviews of those runs wait, and the
 * locks go back to the database however the review ends.
 */
describe.skipIf(!connectionString)(
  'TurboRunReviewLockService PostgreSQL advisory locks',
  () => {
    const config = {
      get: (key: string) =>
        key === 'DATABASE_URL' ? connectionString : undefined,
    } as unknown as ConfigService;
    const logger = { warn: () => undefined } as unknown as LoggerService;
    const services: TurboRunReviewLockService[] = [];
    const observer = connectionString
      ? new Pool({ connectionString, max: 1 })
      : null;
    const organizationId = `org-${Date.now()}`;

    function lockService(): TurboRunReviewLockService {
      const service = new TurboRunReviewLockService(config, logger);
      services.push(service);
      return service;
    }

    /** Whether another session could take the run's review lock right now. */
    async function isFree(runId: string): Promise<boolean> {
      if (!observer) {
        throw new Error('BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL is required');
      }
      const client = await observer.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query<{ acquired: boolean }>(
          'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
          [`turbo-run-review:${organizationId}:${runId}`],
        );
        return rows[0]?.acquired === true;
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    }

    /** Ends the database session that holds the run's review lock. */
    async function dropLockHolder(runId: string): Promise<void> {
      await observer?.query(
        `SELECT pg_terminate_backend(pid) FROM pg_locks
         WHERE locktype = 'advisory' AND objsubid = 1 AND granted
           AND ((classid::bigint << 32) | objid::bigint) = hashtextextended($1, 0)`,
        [`turbo-run-review:${organizationId}:${runId}`],
      );
    }

    afterAll(async () => {
      await Promise.all(services.map((service) => service.onModuleDestroy()));
      await observer?.end();
    });

    it('holds every run of a review until it finishes, then frees them', async () => {
      const service = lockService();
      const heldDuring = await service.run(
        ['run-b', 'run-a', 'run-b'],
        organizationId,
        async () => [await isFree('run-a'), await isFree('run-b')],
      );

      expect(heldDuring).toEqual([false, false]);
      expect([await isFree('run-a'), await isFree('run-b')]).toEqual([
        true,
        true,
      ]);
    });

    it('makes a second review of the same run wait for the first', async () => {
      const first = lockService();
      const second = lockService();
      const timeline: string[] = [];
      let releaseFirst: () => void = () => undefined;
      const firstHolds = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let markFirstStarted: () => void = () => undefined;
      const firstStarted = new Promise<void>((resolve) => {
        markFirstStarted = resolve;
      });

      const firstReview = first.run(['run-c'], organizationId, async () => {
        timeline.push('first starts');
        markFirstStarted();
        await firstHolds;
        timeline.push('first ends');
      });
      await firstStarted;
      const secondReview = second.run(['run-c'], organizationId, async () => {
        timeline.push('second starts');
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      timeline.push('first released');
      releaseFirst();
      await Promise.all([firstReview, secondReview]);

      expect(timeline).toEqual([
        'first starts',
        'first released',
        'first ends',
        'second starts',
      ]);
    });

    it('lets reviews of different runs proceed side by side', async () => {
      const first = lockService();
      const second = lockService();
      const timeline: string[] = [];
      let releaseFirst: () => void = () => undefined;
      const firstHolds = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      let markFirstStarted: () => void = () => undefined;
      const firstStarted = new Promise<void>((resolve) => {
        markFirstStarted = resolve;
      });

      const firstReview = first.run(['run-d'], organizationId, async () => {
        timeline.push('first starts');
        markFirstStarted();
        await firstHolds;
        timeline.push('first ends');
      });
      await firstStarted;
      await second.run(['run-e'], organizationId, async () => {
        timeline.push('second runs');
      });
      releaseFirst();
      await firstReview;

      expect(timeline).toEqual(['first starts', 'second runs', 'first ends']);
    });

    it('keeps nested calls inside the held locks and refuses to widen them', async () => {
      const service = lockService();

      const nested = await service.run(
        ['run-f', 'run-g'],
        organizationId,
        async () => {
          const inner = await service.run(['run-f'], organizationId, async () =>
            isFree('run-f'),
          );
          const widened = await service
            .run(['run-h'], organizationId, async () => 'ran')
            .catch((error: Error) => error.message);
          return { inner, widened };
        },
      );

      expect(nested).toEqual({
        inner: false,
        widened: 'A nested operation cannot expand its review lock.',
      });
    });

    it('frees the runs when the review fails', async () => {
      const service = lockService();

      await expect(
        service.run(['run-i'], organizationId, async () => {
          throw new Error('publish failed');
        }),
      ).rejects.toThrow('publish failed');

      expect(await isFree('run-i')).toBe(true);
    });

    it('fails closed when the lock session is lost mid-review', async () => {
      const service = lockService();

      await expect(
        service.run(['run-j'], organizationId, async () => {
          await dropLockHolder('run-j');
          await vi.waitFor(() => {
            expect(() => service.assertActive()).toThrow();
          });
          return 'published';
        }),
      ).rejects.toThrow('The review lock was lost. Reload before retrying.');

      expect(await isFree('run-j')).toBe(true);
      expect(
        await service.run(['run-j'], organizationId, async () => 'retried'),
      ).toBe('retried');
    });

    it('gives up with a retry message when another review holds the run', async () => {
      const holder = lockService();
      const waiter = lockService();
      let releaseHolder: () => void = () => undefined;
      const holderHolds = new Promise<void>((resolve) => {
        releaseHolder = resolve;
      });
      let markHolderStarted: () => void = () => undefined;
      const holderStarted = new Promise<void>((resolve) => {
        markHolderStarted = resolve;
      });

      const holding = holder.run(['run-k'], organizationId, async () => {
        markHolderStarted();
        await holderHolds;
      });
      await holderStarted;
      const waited = await waiter
        .run(['run-k'], organizationId, async () => 'ran')
        .catch((error: Error) => error.message);
      releaseHolder();
      await holding;

      expect(waited).toBe('This review is updating. Try again.');
    }, 15_000);
  },
);
