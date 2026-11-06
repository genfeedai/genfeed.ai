import { CronCreditsService } from '@workers/crons/credits/cron.credits.service';
import {
  FREE_TRIAL_EXPIRY_LOCK_KEY,
  FREE_TRIAL_EXPIRY_LOCK_TTL_SECONDS,
  FREE_TRIAL_EXPIRY_PAGE_SIZE,
  FREE_TRIAL_EXPIRY_SCHEDULE,
} from '@workers/crons/credits/free-trial-expiry.constants';
import { describe, expect, it } from 'vitest';

const NOW = new Date('2026-10-10T12:00:00.000Z');

type Log = { context: Record<string, unknown>; level: string; message: string };

/**
 * Trial organizations with leftover credits, paged by id after a cursor; a
 * lock store with owners and TTLs; referral settlements and logs recorded.
 */
function buildService(options: {
  balances?: Record<string, number>;
  failingOrganizations?: string[];
  isDiscoveryDown?: boolean;
  lockHolder?: string;
}) {
  const balances = new Map(Object.entries(options.balances ?? {}));
  const locks = new Map<string, { owner: string; ttlSeconds: number }>();
  if (options.lockHolder) {
    locks.set(FREE_TRIAL_EXPIRY_LOCK_KEY, {
      owner: options.lockHolder,
      ttlSeconds: FREE_TRIAL_EXPIRY_LOCK_TTL_SECONDS,
    });
  }
  const logs: Log[] = [];
  const pages: { after: string | undefined; asOf: Date; size: number }[] = [];
  const referralSettlements: Date[] = [];

  const freeTrial = {
    expireTrialCredits: async (organizationId: string) => {
      if (options.failingOrganizations?.includes(organizationId)) {
        throw new Error('serialization exhausted');
      }
      const credits = balances.get(organizationId) ?? 0;
      balances.set(organizationId, 0);
      return credits;
    },
    findExpiryCandidates: async (
      asOf: Date,
      after: string | undefined,
      size: number,
    ) => {
      if (options.isDiscoveryDown) throw new Error('db down');
      pages.push({ after, asOf, size });
      return [...balances.keys()]
        .sort()
        .filter((id) => after === undefined || id > after)
        .slice(0, size);
    },
  };
  const cache = {
    acquireLock: async (key: string, ttlSeconds: number) => {
      if (locks.has(key)) return false;
      locks.set(key, { owner: 'this-worker', ttlSeconds });
      return true;
    },
    releaseLock: async (key: string) => locks.delete(key),
  };
  const record =
    (level: string) => (message: string, context: Record<string, unknown>) =>
      logs.push({ context, level, message });
  const service = new CronCreditsService(
    {
      settleDueRewards: async () => {
        referralSettlements.push(new Date());
      },
    } as unknown as ConstructorParameters<typeof CronCreditsService>[0],
    freeTrial as unknown as ConstructorParameters<typeof CronCreditsService>[1],
    cache as unknown as ConstructorParameters<typeof CronCreditsService>[2],
    {
      debug: record('debug'),
      error: record('error'),
      log: record('log'),
    } as unknown as ConstructorParameters<typeof CronCreditsService>[3],
  );
  return { balances, locks, logs, pages, referralSettlements, service };
}

function firstPageOrganizations(): Record<string, number> {
  return Object.fromEntries(
    Array.from({ length: FREE_TRIAL_EXPIRY_PAGE_SIZE }, (_, index) => [
      `org_${String(index).padStart(3, '0')}`,
      0,
    ]),
  );
}

describe('CronCreditsService', () => {
  it('runs every 15 minutes under a lock shorter than one interval', () => {
    expect(FREE_TRIAL_EXPIRY_SCHEDULE).toBe('*/15 * * * *');
    expect(FREE_TRIAL_EXPIRY_LOCK_TTL_SECONDS).toBe(14 * 60);
  });

  it('settles referral rewards once per call', async () => {
    const { referralSettlements, service } = buildService({});

    await service.settleReferralRewards();

    expect(referralSettlements).toHaveLength(1);
  });

  it('skips the tick while another worker holds the sweep', async () => {
    const { balances, locks, pages, service } = buildService({
      balances: { org_a: 40 },
      lockHolder: 'other-worker',
    });

    await expect(service.expireFreeTrials(NOW)).resolves.toBeNull();

    expect(pages).toEqual([]);
    expect(balances.get('org_a')).toBe(40);
    expect(locks.get(FREE_TRIAL_EXPIRY_LOCK_KEY)?.owner).toBe('other-worker');
  });

  it('expires every candidate across pages and releases the lock', async () => {
    const { balances, locks, pages, service } = buildService({
      balances: { ...firstPageOrganizations(), org_999: 40 },
    });

    await expect(service.expireFreeTrials(NOW)).resolves.toEqual({
      expiredCredits: 40,
      failed: 0,
      organizations: 1,
    });

    expect(pages).toEqual([
      { after: undefined, asOf: NOW, size: FREE_TRIAL_EXPIRY_PAGE_SIZE },
      {
        after: `org_${String(FREE_TRIAL_EXPIRY_PAGE_SIZE - 1).padStart(3, '0')}`,
        asOf: NOW,
        size: FREE_TRIAL_EXPIRY_PAGE_SIZE,
      },
    ]);
    expect(balances.get('org_999')).toBe(0);
    expect(locks.size).toBe(0);
  });

  it('holds the sweep for less than one interval while it runs', async () => {
    const { locks, service } = buildService({ balances: { org_a: 5 } });
    const sweep = service.expireFreeTrials(NOW);
    const lockDuringSweep = locks.get(FREE_TRIAL_EXPIRY_LOCK_KEY);
    await sweep;

    expect(lockDuringSweep).toEqual({
      owner: 'this-worker',
      ttlSeconds: FREE_TRIAL_EXPIRY_LOCK_TTL_SECONDS,
    });
  });

  it('keeps sweeping when one organization fails', async () => {
    const { balances, logs, service } = buildService({
      balances: { org_a: 10, org_b: 25 },
      failingOrganizations: ['org_a'],
    });

    await expect(service.expireFreeTrials(NOW)).resolves.toEqual({
      expiredCredits: 25,
      failed: 1,
      organizations: 1,
    });

    expect(balances.get('org_a')).toBe(10);
    expect(logs).toContainEqual({
      context: expect.objectContaining({
        error: 'serialization exhausted',
        organizationId: 'org_a',
      }),
      level: 'error',
      message: 'Could not expire free-trial credits',
    });
  });

  it('releases the lock when discovery throws', async () => {
    const { locks, service } = buildService({ isDiscoveryDown: true });

    await expect(service.expireFreeTrials(NOW)).rejects.toThrow('db down');
    expect(locks.size).toBe(0);
  });
});
