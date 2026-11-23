vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock(
  '@api/collections/agent-threads/services/agent-threads.service',
  () => ({ AgentThreadsService: class {} }),
);
vi.mock(
  '@api/collections/agent-memories/services/agent-memories.service',
  () => ({ AgentMemoriesService: class {} }),
);

import { runSerializableWithRetry } from '@api/collections/workflows/utils/serializable-retry.util';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  explore,
  type Scenario,
  type Simulation,
} from '@genfeedai/utils/model-checking/interleaving-explorer';
import type { LoggerService } from '@libs/logger/logger.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');

/**
 * The thread engine appends events inside a Serializable transaction, while
 * three other writers replace the whole `agent_thread_snapshots.data` JSON:
 * `recordProfileSnapshot`, the `input.requested` branch of `syncSideEffects`
 * and `upsertBinding` (#10906). This model runs each real writer against one
 * snapshot row whose every statement is an atomic step, with an append landing
 * at any point, and states the harm: a committed append that a later write
 * erased, which drops a pending question or restores an answered one.
 *
 * The first scenario replays the code before the fix: the row read outside any
 * transaction and written back as a plain update.
 */

const ORG = 'org-1';
const THREAD = 'thread-1';
const APPENDED = { requestId: 'append-question' };

type Data = Record<string, unknown>;
type Snapshot = { data: Data; id: string; version: number };
type Transaction = { base: number | null; staged: Data | null };

function createWorld(sim: Simulation) {
  const snapshot: Snapshot = {
    data: { lastSequence: 0, pendingInputRequests: [] },
    id: 'snapshot-1',
    version: 0,
  };
  const clone = (data: Data): Data => JSON.parse(JSON.stringify(data));

  /** A client over the row; a transaction reads a snapshot and commits only if nobody committed since. */
  const client = (transaction: Transaction | null) => ({
    agentThreadSnapshot: {
      create: async () => {
        throw new Error('The snapshot exists in every scenario.');
      },
      findFirst: async () => {
        await sim.step('read the snapshot');
        if (transaction && transaction.base === null) {
          transaction.base = snapshot.version;
        }
        const data = clone(transaction?.staged ?? snapshot.data);
        sim.observed(data);
        return { data, id: snapshot.id };
      },
      update: async ({ data }: { data: { data: Data } }) => {
        await sim.step('write the snapshot');
        if (transaction) {
          transaction.staged = clone(data.data);
        } else {
          snapshot.data = clone(data.data);
          snapshot.version += 1;
        }
        return { data: clone(data.data), id: snapshot.id };
      },
    },
  });

  const prisma = {
    ...client(null),
    $transaction: async <T>(
      work: (tx: ReturnType<typeof client>) => Promise<T>,
    ): Promise<T> => {
      const transaction: Transaction = { base: null, staged: null };
      const result = await work(client(transaction));
      await sim.step('commit');
      if (transaction.base !== null && transaction.base !== snapshot.version) {
        throw Object.assign(new Error('serialization failure'), {
          code: 'P2034',
        });
      }
      if (transaction.staged) {
        snapshot.data = transaction.staged;
        snapshot.version += 1;
      }
      return result;
    },
  };

  return { prisma, snapshot };
}

/** What `appendEventInTransaction` does to the row: a new pending question and the next sequence. */
async function append(prisma: ReturnType<typeof createWorld>['prisma']) {
  await runSerializableWithRetry(prisma as never, async (tx) => {
    const row = await tx.agentThreadSnapshot.findFirst({} as never);
    const data = (row?.data ?? {}) as Data;
    await tx.agentThreadSnapshot.update({
      data: {
        data: {
          ...data,
          lastSequence: Number(data.lastSequence ?? 0) + 1,
          pendingInputRequests: [
            ...((data.pendingInputRequests as unknown[]) ?? []),
            APPENDED,
          ],
        },
      },
    } as never);
  });
}

type WriterName = 'upsertBinding' | 'recordProfileSnapshot' | 'inputRequested';

const WRITERS: Record<
  WriterName,
  {
    run: (prisma: ReturnType<typeof createWorld>['prisma']) => Promise<unknown>;
    /** True when the writer's own change is in the stored data. */
    kept: (data: Data) => boolean;
  }
> = {
  inputRequested: {
    kept: (data) =>
      (data.inputRequests as Array<{ requestId: string }> | undefined)?.some(
        (request) => request.requestId === 'writer-question',
      ) === true,
    run: async (prisma) => {
      const engine = Object.create(
        AgentThreadEngineService.prototype,
      ) as unknown as {
        prisma: unknown;
        runtimeSessionService: unknown;
        syncSideEffects: (
          event: Record<string, unknown>,
          organizationId: string,
          threadId: string,
        ) => Promise<void>;
      };
      engine.prisma = prisma;
      engine.runtimeSessionService = { upsertBinding: async () => null };
      await engine.syncSideEffects(
        {
          payload: { prompt: 'Which one?', requestId: 'writer-question' },
          runId: 'run-1',
          sequence: 1,
          type: 'input.requested',
        },
        ORG,
        THREAD,
      );
    },
  },
  recordProfileSnapshot: {
    kept: (data) =>
      (data.profileSnapshot as { model?: string } | undefined)?.model ===
      'writer-model',
    run: async (prisma) => {
      const engine = Object.create(
        AgentThreadEngineService.prototype,
      ) as unknown as {
        ensureThreadAccess: () => Promise<void>;
        prisma: unknown;
        recordProfileSnapshot: (
          threadId: string,
          organizationId: string,
          userId: string,
          profile: object,
        ) => Promise<unknown>;
      };
      engine.prisma = prisma;
      engine.ensureThreadAccess = async () => undefined;
      await engine.recordProfileSnapshot(THREAD, ORG, 'user-1', {
        model: 'writer-model',
      });
    },
  },
  upsertBinding: {
    kept: (data) =>
      (data.sessionBinding as { status?: string } | undefined)?.status ===
      'running',
    run: async (prisma) => {
      const service = new AgentRuntimeSessionService(
        prisma as unknown as PrismaService,
        {
          debug: vi.fn(),
          error: vi.fn(),
          log: vi.fn(),
        } as unknown as LoggerService,
      );
      await service.upsertBinding({
        organizationId: ORG,
        status: 'running',
        threadId: THREAD,
      });
    },
  },
};

/** The harm, stated over the stored row. */
function lostAppend(data: Data): string | null {
  if (data.lastSequence !== 1) {
    return `the append's sequence was lost (lastSequence ${String(data.lastSequence)})`;
  }
  const pending = (data.pendingInputRequests as unknown[]) ?? [];
  return pending.some(
    (request) =>
      (request as { requestId?: string }).requestId === APPENDED.requestId,
  )
    ? null
    : 'the pending question the append recorded was erased';
}

function scenario(
  writer: (
    prisma: ReturnType<typeof createWorld>['prisma'],
  ) => Promise<unknown>,
  isKept: (data: Data) => boolean,
): () => Scenario {
  return () => {
    vi.clearAllTimers();
    vi.setSystemTime(0);
    let world: ReturnType<typeof createWorld>;
    return {
      final: () =>
        lostAppend(world.snapshot.data) ??
        (isKept(world.snapshot.data)
          ? null
          : "the writer's own change is missing from the stored data"),
      snapshot: () =>
        JSON.stringify([world.snapshot, Date.now(), vi.getTimerCount()]),
      start: (sim) => {
        world = createWorld(sim);
        sim.environment(
          'time passes',
          () => vi.getTimerCount() > 0,
          () => {
            vi.advanceTimersByTime(1000);
          },
        );
        sim.spawn('append', () => append(world.prisma));
        sim.spawn('writer', () => writer(world.prisma));
      },
    };
  };
}

describe('agent thread snapshot writers against a concurrent append (#10906)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('replays the unfixed write: a read outside the transaction erases a committed append', async () => {
    const unfixed = async (
      prisma: ReturnType<typeof createWorld>['prisma'],
    ) => {
      const row = await prisma.agentThreadSnapshot.findFirst();
      await prisma.agentThreadSnapshot.update({
        data: {
          data: {
            ...row.data,
            sessionBinding: { status: 'running' },
          },
        },
      });
    };

    const result = await explore(
      scenario(
        unfixed,
        (data) =>
          (data.sessionBinding as { status?: string } | undefined)?.status ===
          'running',
      ),
    );

    expect(result.violation).toEqual({
      message: "the append's sequence was lost (lastSequence 0)",
      trace: [
        'append: read the snapshot',
        'writer: read the snapshot',
        'append: write the snapshot',
        'append: commit',
        'writer: write the snapshot',
      ],
    });
  });

  it.each(
    Object.entries(WRITERS) as Array<
      [WriterName, (typeof WRITERS)[WriterName]]
    >,
  )('%s keeps a committed append in every order', async (_name, writer) => {
    const result = await explore(scenario(writer.run, writer.kept));

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(5);
  });
});
