import { OutlierReadClaimService } from '@api/collections/outlier-library/services/outlier-read-claim.service';
import { Platform } from '@genfeedai/contracts';
import {
  explore,
  type Scenario,
  type Simulation,
} from '@genfeedai/utils/model-checking/interleaving-explorer';
import { describe, expect, it } from 'vitest';

/**
 * Two workers run the weekly read side by side at every deploy. This model
 * runs the real claim service twice against a Postgres double whose every
 * statement is one atomic step, with a worker crashing before any step and a
 * claim's lease running out at any moment, then a later tick once all ended.
 *
 * Harms it rules out:
 * - a creator's attempt is recorded twice in one week;
 * - the scraper is called more often than the week's budget allows;
 * - a creator is lost: the week ends with it unread and budget left over.
 */

const NOW = new Date('2026-11-25T10:00:00.000Z');
const LEASE_MS = 20 * 60 * 1000;
const CREATORS = ['a', 'b'];
const CAP = 2;
const LONG_AGO = new Date(0);

type Row = Record<string, unknown>;

type World = {
  attempts: Map<string, number>;
  budget: { claimed: number } | null;
  creators: Row[];
  /** How often each creator went to the scraper. */
  reads: Map<string, number>;
  /** Scraper calls: one per creator a worker went on to read. */
  scrapes: number;
};

function freshCreator(id: string): Row {
  return {
    externalId: id,
    handle: id,
    id,
    isDeleted: false,
    lastReadAttemptAt: null,
    platform: Platform.TIKTOK,
    readClaimId: null,
    readClaimedUntil: null,
    status: 'active',
  };
}

/**
 * The part of a Prisma `where` the claim uses. A filter the model does not
 * know throws, so a changed query shape cannot slip past it unchecked.
 */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND')
      return (condition as Row[]).every((part) => matches(row, part));
    if (key === 'OR')
      return (condition as Row[]).some((part) => matches(row, part));
    const value = row[key];
    if (condition === null || typeof condition !== 'object') {
      return value === condition;
    }
    return Object.entries(condition as Row).every(([operator, operand]) => {
      if (operator === 'lt') {
        return (
          value instanceof Date && value.getTime() < (operand as Date).getTime()
        );
      }
      throw new Error(`The model does not know the filter ${key}.${operator}.`);
    });
  });
}

function byOldestAttempt(left: Row, right: Row): number {
  const a = (left.lastReadAttemptAt as Date | null)?.getTime() ?? -1;
  const b = (right.lastReadAttemptAt as Date | null)?.getTime() ?? -1;
  return a - b || String(left.id).localeCompare(String(right.id));
}

function prismaDouble(sim: Simulation, world: World) {
  return {
    outlierCreator: {
      findFirst: async ({ select, where }: { select: Row; where: Row }) => {
        await sim.step('postgres SELECT oldest due creator');
        const row = world.creators
          .filter((creator) => matches(creator, where))
          .sort(byOldestAttempt)[0];
        const found = row
          ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]))
          : null;
        sim.observed(found?.id ?? null);
        return found;
      },
      updateMany: async ({ data, where }: { data: Row; where: Row }) => {
        await sim.step('postgres UPDATE creator');
        const hit = world.creators.filter((row) => matches(row, where));
        for (const row of hit) {
          if ('lastReadAttemptAt' in data) {
            const id = String(row.id);
            world.attempts.set(id, (world.attempts.get(id) ?? 0) + 1);
          }
          Object.assign(row, data);
        }
        sim.observed(hit.length);
        return { count: hit.length };
      },
    },
    outlierReadBudget: {
      createMany: async () => {
        await sim.step('postgres INSERT budget row');
        world.budget ??= { claimed: 0 };
        return { count: 1 };
      },
      updateMany: async ({
        data,
        where,
      }: {
        data: { claimed: { decrement?: number; increment?: number } };
        where: { claimed: { gt?: number; lt?: number } };
      }) => {
        await sim.step('postgres UPDATE budget');
        const claimed = world.budget?.claimed ?? null;
        const { gt, lt } = where.claimed;
        const open =
          claimed !== null &&
          (lt === undefined || claimed < lt) &&
          (gt === undefined || claimed > gt);
        if (open && world.budget) {
          world.budget.claimed +=
            (data.claimed.increment ?? 0) - (data.claimed.decrement ?? 0);
        }
        sim.observed(open ? 1 : 0);
        return { count: open ? 1 : 0 };
      },
    },
  };
}

type Worker = () => Promise<unknown>;

/** What a worker does with the claim service: claim, scrape, complete, repeat. */
function readLoop(
  sim: Simulation,
  world: World,
  claimNext: () => Promise<{ id: string } | null>,
  complete: (id: string) => Promise<unknown>,
): Worker {
  return async () => {
    for (let index = 0; index < CREATORS.length; index += 1) {
      const creator = await claimNext();
      if (!creator) return;
      await sim.step('the scraper reads the creator');
      world.scrapes += 1;
      world.reads.set(creator.id, (world.reads.get(creator.id) ?? 0) + 1);
      await complete(creator.id);
    }
  };
}

function scenarioOf(
  makeWorker: (sim: Simulation, world: World, name: string) => Worker,
): () => Scenario {
  return () => {
    const world: World = {
      attempts: new Map(),
      budget: null,
      creators: CREATORS.map(freshCreator),
      reads: new Map(),
      scrapes: 0,
    };
    return {
      final: () => {
        const attempted = world.creators.filter(
          (row) => row.lastReadAttemptAt !== null,
        ).length;
        const claimed = world.budget?.claimed ?? 0;
        if (attempted < CREATORS.length && claimed < CAP) {
          return `a creator was lost: ${attempted} of ${CREATORS.length} attempted with ${CAP - claimed} units of budget left`;
        }
        return null;
      },
      invariant: () => {
        for (const [id, count] of world.attempts) {
          if (count > 1) return `creator ${id} was recorded ${count} times`;
        }
        for (const [id, count] of world.reads) {
          if (count > 1) return `creator ${id} was read ${count} times`;
        }
        if (world.scrapes > CAP) {
          return `the scraper ran ${world.scrapes} times with a cap of ${CAP}`;
        }
        return null;
      },
      snapshot: () =>
        JSON.stringify([
          world.creators.map((row) => [
            row.id,
            row.lastReadAttemptAt !== null,
            row.readClaimId,
            row.readClaimedUntil === null
              ? null
              : (row.readClaimedUntil as Date).getTime() === LONG_AGO.getTime(),
          ]),
          world.budget,
          world.scrapes,
          [...world.attempts.entries()],
          [...world.reads.entries()],
        ]),
      start: (sim) => {
        sim.environment(
          'a claim lease runs out',
          () =>
            world.creators.some(
              (row) =>
                row.readClaimId !== null &&
                (row.readClaimedUntil as Date).getTime() !== LONG_AGO.getTime(),
            ),
          () => {
            const row = world.creators.find(
              (creator) =>
                creator.readClaimId !== null &&
                (creator.readClaimedUntil as Date).getTime() !==
                  LONG_AGO.getTime(),
            );
            if (row) row.readClaimedUntil = LONG_AGO;
          },
        );
        sim.spawn('worker 1', makeWorker(sim, world, 'worker-1'), {
          crashable: true,
        });
        sim.spawn('worker 2', makeWorker(sim, world, 'worker-2'), {
          crashable: true,
        });
        sim.onQuiescence(() =>
          sim.spawn('later tick', makeWorker(sim, world, 'later-tick')),
        );
      },
    };
  };
}

function realWorker(sim: Simulation, world: World, name: string): Worker {
  const service = new OutlierReadClaimService(
    prismaDouble(sim, world) as never,
  );
  return readLoop(
    sim,
    world,
    () =>
      service.claimNext(Platform.TIKTOK, {
        cap: CAP,
        claimId: name,
        leaseMs: LEASE_MS,
        now: NOW,
      }),
    (id) => service.complete(id, name, { missed: false }),
  );
}

/**
 * A claim that reads before it writes: it picks the oldest due creator, takes
 * it with an update that does not name the claim, and checks the budget with
 * a read before spending it. Two workers that read the same row both win it.
 */
function naiveWorker(sim: Simulation, world: World, name: string): Worker {
  const prisma = prismaDouble(sim, world);
  return readLoop(
    sim,
    world,
    async () => {
      const candidate = (await prisma.outlierCreator.findFirst({
        select: { id: true },
        where: {
          lastReadAttemptAt: null,
          readClaimId: null,
        },
      })) as { id: string } | null;
      if (!candidate) return null;
      await prisma.outlierCreator.updateMany({
        data: {
          readClaimId: name,
          readClaimedUntil: new Date(NOW.getTime() + LEASE_MS),
        },
        where: { id: candidate.id },
      });
      await prisma.outlierReadBudget.createMany();
      await sim.step('postgres SELECT budget');
      const seen = world.budget?.claimed ?? 0;
      sim.observed(seen);
      if (seen >= CAP) return null;
      await sim.step('postgres UPDATE budget to the value read plus one');
      if (world.budget) world.budget.claimed = seen + 1;
      return candidate;
    },
    (id) =>
      prisma.outlierCreator.updateMany({
        data: { lastReadAttemptAt: NOW, readClaimId: null },
        where: { id },
      }),
  );
}

/**
 * The claim before it stamped the attempt (#11657 review): it takes a lease
 * and records the attempt only when the read ends. A read that outlives the
 * lease lets a second worker take the same creator in the same week.
 */
function leaseOnlyWorker(sim: Simulation, world: World, name: string): Worker {
  const prisma = prismaDouble(sim, world);
  const due = {
    AND: [
      { OR: [{ lastReadAttemptAt: null }] },
      { OR: [{ readClaimedUntil: null }, { readClaimedUntil: { lt: NOW } }] },
    ],
    isDeleted: false,
    platform: Platform.TIKTOK,
    status: 'active',
  };
  return readLoop(
    sim,
    world,
    async () => {
      for (;;) {
        const candidate = (await prisma.outlierCreator.findFirst({
          select: { id: true },
          where: due,
        })) as { id: string } | null;
        if (!candidate) return null;
        const won = await prisma.outlierCreator.updateMany({
          data: {
            readClaimId: name,
            readClaimedUntil: new Date(NOW.getTime() + LEASE_MS),
          },
          where: { ...due, id: candidate.id },
        });
        if (won.count === 0) continue;
        await prisma.outlierReadBudget.createMany();
        const reserved = await prisma.outlierReadBudget.updateMany({
          data: { claimed: { increment: 1 } },
          where: { claimed: { lt: CAP } },
        });
        if (reserved.count === 0) {
          await prisma.outlierCreator.updateMany({
            data: { readClaimId: null, readClaimedUntil: null },
            where: { id: candidate.id, readClaimId: name },
          });
          return null;
        }
        return candidate;
      }
    },
    (id) =>
      prisma.outlierCreator.updateMany({
        data: {
          lastReadAttemptAt: NOW,
          readClaimId: null,
          readClaimedUntil: null,
        },
        where: { id, readClaimId: name },
      }),
  );
}

describe('outlier weekly read claim, every order of two workers', () => {
  it('never records a creator twice, never passes the cap and never loses a creator', async () => {
    const { schedules, violation } = await explore(scenarioOf(realWorker));

    expect(violation).toBeNull();
    expect(schedules).toBeGreaterThan(1);
  });

  it('finds the harm in a claim that reads before it writes', async () => {
    const { violation } = await explore(scenarioOf(naiveWorker));

    expect(violation?.message).toBe('creator a was read 2 times');
  });

  it('finds the harm in a claim that only leases a creator', async () => {
    const { violation } = await explore(scenarioOf(leaseOnlyWorker));

    expect(violation?.message).toBe('creator a was read 2 times');
  });
});
