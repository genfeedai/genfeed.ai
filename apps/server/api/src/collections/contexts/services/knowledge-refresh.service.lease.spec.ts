import { KnowledgeRefreshService } from '@api/collections/contexts/services/knowledge-refresh.service';
import { extractSourceText } from '@api/collections/contexts/utils/extract-source-text.util';
import {
  KnowledgeRefreshRunStatus,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
  KnowledgeSourceSyncState,
} from '@genfeedai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/collections/contexts/utils/extract-source-text.util', () => ({
  extractSourceText: vi.fn(),
  KNOWLEDGE_SOURCE_MAX_BYTES: 2_000_000,
}));

const actor = { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' };
const LEASE_MS = 5 * 60 * 1000;

type Row = Record<string, unknown>;
type Condition = unknown;

function matches(row: Row, where: Record<string, Condition>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') {
      return (condition as Record<string, Condition>[]).some((branch) =>
        matches(row, branch),
      );
    }
    const value = row[key];
    if (condition instanceof Object && !(condition instanceof Date)) {
      const operators = condition as Record<string, unknown>;
      if ('in' in operators) return (operators.in as unknown[]).includes(value);
      if ('lte' in operators)
        return (
          value instanceof Date &&
          value.getTime() <= (operators.lte as Date).getTime()
        );
      throw new Error(`Unmodelled condition on ${key}`);
    }
    return value === condition;
  });
}

function apply(row: Row, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    const isIncrement =
      value instanceof Object &&
      !(value instanceof Date) &&
      'increment' in (value as Record<string, unknown>);
    row[key] = isIncrement
      ? Number(row[key] ?? 0) +
        Number((value as { increment: number }).increment)
      : value;
  }
}

/** The two tables the refresh service writes, with `updateMany` as a real compare-and-set. */
function refreshWorld() {
  const runs: Row[] = [];
  const source: Row = {
    consecutiveFailures: 0,
    firstFailureAt: null,
    gracePeriodMinutes: 10_080,
    id: 'source-1',
    isDeleted: false,
    kind: KnowledgeSourceKind.URL,
    organizationId: 'org-1',
    staleAt: null,
    syncState: KnowledgeSourceSyncState.CURRENT,
  };
  let nextRun = 1;
  const table = (rows: () => Row[]) => ({
    findFirst: async ({ where }: { where: Record<string, Condition> }) => {
      const found = rows().find((row) => matches(row, where));
      return found ? { ...found } : null;
    },
    updateMany: async ({
      data,
      where,
    }: {
      data: Record<string, unknown>;
      where: Record<string, Condition>;
    }) => {
      const hits = rows().filter((row) => matches(row, where));
      for (const row of hits) apply(row, data);
      return { count: hits.length };
    },
  });
  const prisma = {
    knowledgeSource: table(() => [source]),
    knowledgeSourceRefreshRun: {
      ...table(() => runs),
      create: async ({ data }: { data: Row }) => {
        const row = { id: `run-${nextRun++}`, isDeleted: false, ...data };
        runs.push(row);
        return { ...row };
      },
    },
    knowledgeSourceVersion: { findFirst: async () => null },
    $transaction: async (work: unknown) =>
      Array.isArray(work)
        ? Promise.all(work)
        : (work as (tx: unknown) => unknown)(prisma),
  };
  return { prisma, runs, source };
}

function buildService() {
  const world = refreshWorld();
  const records = {
    createCandidateVersion: vi.fn(),
    getCurrentVersion: vi.fn().mockResolvedValue({
      id: 'version-1',
      payload: { contentFingerprint: 'abc', referenceUrl: 'https://ex.com' },
      provenance: { url: 'https://ex.com' },
    }),
    getSource: vi.fn().mockResolvedValue({
      id: 'source-1',
      isRefreshEnabled: true,
      kind: KnowledgeSourceKind.URL,
      purpose: KnowledgeSourcePurpose.RESEARCH,
      referenceUrl: 'https://ex.com',
    }),
  };
  const service = new KnowledgeRefreshService(
    world.prisma as never,
    records as never,
    { enqueueIngest: vi.fn() } as never,
    { log: vi.fn(), warn: vi.fn() } as never,
    { complete: vi.fn() } as never,
    { createWorkflow: vi.fn() } as never,
    { syncWorkflowScheduler: vi.fn() } as never,
  );
  return { ...world, service };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

const unchanged = { mimeType: 'text/html', notModified: true, text: '' };
const unreachable = () =>
  Object.assign(new Error('dns'), { code: 'ENOTFOUND' });

describe('KnowledgeRefreshService lease ownership (#10401)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.mocked(extractSourceText).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Worker A holds a run whose lease runs out while it waits on the network.
   * Caller B takes the run over, fails it as expired and starts a run of its
   * own, which fails too. A then finishes.
   */
  async function lateWorker(finish: 'succeeds' | 'fails') {
    const { runs, service, source } = buildService();
    const gate = deferred<typeof unchanged>();
    vi.mocked(extractSourceText)
      .mockImplementationOnce(() => gate.promise)
      .mockRejectedValueOnce(unreachable());

    const late = service
      .refresh(actor, 'source-1', 'tick-a', { force: true })
      .then(
        () => 'resolved',
        () => 'rejected',
      );
    await vi.waitFor(() => expect(extractSourceText).toHaveBeenCalledTimes(1));
    vi.setSystemTime(Date.now() + LEASE_MS + 1000);

    await expect(
      service.refresh(actor, 'source-1', 'tick-b', { force: true }),
    ).rejects.toMatchObject({ status: 422 });

    if (finish === 'succeeds') gate.resolve(unchanged);
    else gate.reject(unreachable());
    await late;
    return { runs, source };
  }

  it('keeps a taken-over run failed when the late worker finishes unchanged', async () => {
    const { runs, source } = await lateWorker('succeeds');

    expect(runs[0]?.status).toBe(KnowledgeRefreshRunStatus.FAILED);
    expect(runs[0]?.outcome).toBeUndefined();
    expect(source.syncState).toBe(KnowledgeSourceSyncState.FAILED);
    expect(source.consecutiveFailures).toBe(2);
  });

  it('counts a failure once when the late worker fails after the takeover', async () => {
    const { runs, source } = await lateWorker('fails');

    expect(runs.map((run) => run.status)).toEqual([
      KnowledgeRefreshRunStatus.FAILED,
      KnowledgeRefreshRunStatus.FAILED,
    ]);
    expect(source.consecutiveFailures).toBe(2);
  });

  it('still completes a run whose lease expired when nobody took it over', async () => {
    const { runs, service, source } = buildService();
    const gate = deferred<typeof unchanged>();
    vi.mocked(extractSourceText).mockImplementationOnce(() => gate.promise);

    const late = service.refresh(actor, 'source-1', 'tick-a', { force: true });
    await vi.waitFor(() => expect(extractSourceText).toHaveBeenCalledTimes(1));
    vi.setSystemTime(Date.now() + LEASE_MS + 1000);
    gate.resolve(unchanged);
    await late;

    expect(runs[0]?.status).toBe(KnowledgeRefreshRunStatus.COMPLETED);
    expect(source.syncState).toBe(KnowledgeSourceSyncState.CURRENT);
  });
});
