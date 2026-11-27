import { SubscriptionTier } from '@genfeedai/contracts';
import {
  explore,
  type Scenario,
  type Simulation,
} from '@genfeedai/utils/model-checking/interleaving-explorer';
import { describe, expect, it, vi } from 'vitest';
import { noteResearchRunStarted } from './research-scan.context';
import { ResearchScanService } from './research-scan.service';

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();
  return { ...actual, isSaaS: vi.fn(() => true) };
});

/**
 * An organization without a plan has one trends scan a week (#11623). Two
 * requests arrive together, a request can die before it takes the scan, and a
 * collection can fail before it reaches the scraper. This model runs the real
 * `runScan` (reserve behind an advisory lock, run, release) against a scan
 * table whose every statement is a step.
 *
 * Harms it rules out:
 * - two scraper runs for one weekly scan (the organization is billed twice);
 * - a run that reached the scraper whose scan is not counted.
 *
 * The advisory lock is modelled as the transaction being one atomic step, the
 * way the agent event run model treats its serializable transaction: Postgres
 * lets one holder through at a time. What the model proves is that the code
 * keeps its check and its insert inside that one transaction, and the second
 * scenario shows it looking: the same code over a table whose transaction is
 * not serialised lets both requests run.
 *
 * A request that crashes after it reserved a scan, before it released it,
 * leaves the scan counted. The organization loses a scan; it never gains one.
 *
 * Assumption: the window does not close during the race (a week against a
 * request of seconds).
 */

const ORG = 'org-1';
const NOW = new Date('2026-11-27T12:00:00.000Z');

type Row = {
  id: string;
  isDeleted: boolean;
  library: string;
  organizationId: string;
};

type World = {
  rows: Row[];
  /** Requests that reached the scraper. */
  runs: number;
};

type Where = Record<string, unknown>;

/** The part of a Prisma `where` the service uses; any other filter throws. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, wanted]) => {
    if (key === 'createdAt') return true;
    if (wanted !== null && typeof wanted === 'object') {
      throw new Error(`The model does not know the filter ${key}.`);
    }
    return (row as unknown as Where)[key] === wanted;
  });
}

function scanTable(sim: Simulation, world: World, isSerialized: boolean) {
  const statements = {
    create: async ({ data }: { data: Omit<Row, 'id'> }) => {
      if (!isSerialized) await sim.step('postgres INSERT scan');
      const row = { ...data, id: `scan-${world.rows.length + 1}` };
      world.rows.push(row);
      return { id: row.id };
    },
    findMany: async ({ where }: { where: Where }) => {
      if (!isSerialized) await sim.step('postgres SELECT scans');
      const found = world.rows.filter((row) => matches(row, where));
      sim.observed(found.length);
      return found.map(() => ({ createdAt: NOW }));
    },
  };
  const tx = {
    ...statements,
    $queryRaw: async () => [],
    researchScan: statements,
  };
  return {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      // The advisory lock: one holder at a time, so the transaction is one step.
      if (isSerialized)
        await sim.step('postgres transaction under advisory lock');
      return callback(tx);
    },
    researchScan: {
      updateMany: async ({
        data,
        where,
      }: {
        data: Partial<Row>;
        where: Where;
      }) => {
        await sim.step('postgres UPDATE release scan');
        const found = world.rows.filter((row) => matches(row, where));
        for (const row of found) Object.assign(row, data);
        return { count: found.length };
      },
    },
  };
}

type Request = (actor: string) => Promise<unknown>;

function scenario(isSerialized: boolean, outcomes: readonly string[]) {
  return (): Scenario => {
    const world: World = { rows: [], runs: 0 };
    return {
      final: () => {
        const counted = world.rows.filter((row) => !row.isDeleted).length;
        return counted < world.runs
          ? `${world.runs} runs reached the scraper but ${counted} scans are counted`
          : null;
      },
      invariant: () =>
        world.runs > 1
          ? `${world.runs} scraper runs for one weekly scan`
          : null,
      snapshot: () => JSON.stringify([world.rows, world.runs]),
      start: (sim) => {
        const prisma = scanTable(sim, world, isSerialized);
        const access = {
          resolve: async () => ({
            decision: {
              isAllowed: false,
              reason: 'research_paid_access_required',
            },
            tier: SubscriptionTier.FREE,
          }),
        };
        const service = new ResearchScanService(
          prisma as never,
          access as never,
          { error: vi.fn(), warn: vi.fn() } as never,
        );
        const request: Request = async () =>
          service.runScan(
            { library: 'trends', organizationId: ORG },
            async () => {
              const outcome = await sim.choose('the collection', outcomes);
              if (outcome === 'fails before the scraper') {
                throw new Error('the cache answered');
              }
              noteResearchRunStarted(ORG);
              await sim.step('scraper request');
              world.runs += 1;
            },
            NOW,
          );
        sim.spawn('request 1', () => request('request 1'), { crashable: true });
        sim.spawn('request 2', () => request('request 2'), { crashable: true });
      },
    };
  };
}

describe('Two scan requests of an organization without a plan, every interleaving', () => {
  it('start at most one run, and count every run that started', async () => {
    const result = await explore(
      scenario(true, ['reaches the scraper', 'fails before the scraper']),
    );

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(5);
  });

  it('fails when the check and the insert are not serialised', async () => {
    const result = await explore(scenario(false, ['reaches the scraper']));

    expect(result.violation).toEqual({
      message: '2 scraper runs for one weekly scan',
      trace: expect.arrayContaining([
        'request 1: postgres SELECT scans',
        'request 2: postgres SELECT scans',
      ]),
    });
  });
});
