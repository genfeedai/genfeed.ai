vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});
vi.mock(
  '@api/collections/agent-threads/services/agent-threads.service',
  () => ({ AgentThreadsService: class {} }),
);
vi.mock(
  '@api/collections/agent-memories/services/agent-memories.service',
  () => ({ AgentMemoriesService: class {} }),
);

import type { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import type { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import type { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

const orgId = 'a'.repeat(24);
const threadId = 'b'.repeat(24);
const userId = 'c'.repeat(24);

type Row = Record<string, unknown> & { id: string };

/**
 * An in-memory Postgres stand-in with Serializable semantics: a transaction
 * works on its own view, and its commit fails with P2034 when another
 * transaction committed a write to the same thread after it started. Every
 * committed snapshot state is recorded, so a test can see what a concurrent
 * reader could have observed.
 */
function createDatabase() {
  let version = 0;
  let nextId = 0;
  const events: Row[] = [];
  const snapshots: Row[] = [];
  const committedSnapshots: Array<Record<string, unknown>> = [];

  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  function client(view: { events: Row[]; snapshots: Row[] }) {
    return {
      agentThreadEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          await Promise.resolve();
          const row = { ...data, id: `event-${++nextId}` };
          view.events.push(row);
          return row;
        },
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          await Promise.resolve();
          return view.events.find((row) => matches(row, where)) ?? null;
        },
      },
      agentThreadSnapshot: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          await Promise.resolve();
          const row = { ...data, id: `snapshot-${++nextId}` };
          view.snapshots.push(row);
          return row;
        },
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          await Promise.resolve();
          return view.snapshots.find((row) => matches(row, where)) ?? null;
        },
        findUnique: async ({ where }: { where: { id: string } }) => {
          await Promise.resolve();
          return view.snapshots.find((row) => row.id === where.id) ?? null;
        },
        update: async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: { id: string };
        }) => {
          await Promise.resolve();
          const index = view.snapshots.findIndex((row) => row.id === where.id);
          const updated = { ...view.snapshots[index], ...data } as Row;
          view.snapshots[index] = updated;
          return updated;
        },
      },
    };
  }

  const committedView = { events, snapshots };
  const autoCommit = client(committedView);
  const recordSnapshots = () => {
    for (const row of snapshots) {
      committedSnapshots.push(
        structuredClone(row.data) as Record<string, unknown>,
      );
    }
  };

  const prisma = {
    ...autoCommit,
    agentThreadSnapshot: {
      ...autoCommit.agentThreadSnapshot,
      create: async (args: { data: Record<string, unknown> }) => {
        const row = await autoCommit.agentThreadSnapshot.create(args);
        version += 1;
        recordSnapshots();
        return row;
      },
      update: async (args: {
        data: Record<string, unknown>;
        where: { id: string };
      }) => {
        const row = await autoCommit.agentThreadSnapshot.update(args);
        version += 1;
        recordSnapshots();
        return row;
      },
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: async <T>(
      run: (tx: ReturnType<typeof client>) => Promise<T>,
    ): Promise<T> => {
      const startedAt = version;
      const view = {
        events: [...events],
        snapshots: snapshots.map((row) => ({ ...row })),
      };
      const result = await run(client(view));
      if (version !== startedAt) {
        throw Object.assign(new Error('could not serialize access'), {
          code: 'P2034',
        });
      }
      events.splice(0, events.length, ...view.events);
      snapshots.splice(0, snapshots.length, ...view.snapshots);
      version += 1;
      recordSnapshots();
      return result;
    },
  };

  return { committedSnapshots, events, prisma, snapshots };
}

function createEngine(prisma: unknown) {
  return new AgentThreadEngineService(
    prisma as PrismaService,
    {
      findOne: vi.fn().mockResolvedValue({
        id: threadId,
        source: 'agent',
        status: 'active',
        title: 'Thread',
      }),
    } as unknown as AgentThreadsService,
    {} as AgentMemoriesService,
    { upsertBinding: vi.fn() } as unknown as AgentRuntimeSessionService,
    new AgentThreadProjectorService(),
    { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
  );
}

const requested = {
  commandId: `turn-requested:${threadId}:exec-1`,
  organizationId: orgId,
  payload: { content: 'Approved plan plan-1.' },
  runId: 'exec-1',
  threadId,
  type: 'thread.turn_requested' as const,
  userId,
};

describe('AgentThreadEngineService.appendEvent atomicity', () => {
  it('records a command appended concurrently by the API and the worker exactly once', async () => {
    const database = createDatabase();
    const engine = createEngine(database.prisma);

    const [fromApi, fromWorker] = await Promise.all([
      engine.appendEvent(requested),
      engine.appendEvent(requested),
    ]);

    expect(database.events).toHaveLength(1);
    expect(fromApi.id).toBe(fromWorker.id);
    expect(database.snapshots[0]?.data).toMatchObject({ lastSequence: 1 });
  });

  it('never commits a sequence ahead of the projection that applies it', async () => {
    const database = createDatabase();
    const engine = createEngine(database.prisma);

    await engine.appendEvent(requested);
    await engine.appendEvent({
      ...requested,
      commandId: `run-completed:${threadId}:exec-1`,
      payload: { status: 'completed' },
      type: 'run.completed',
    });

    expect(database.committedSnapshots.length).toBeGreaterThan(0);
    for (const snapshot of database.committedSnapshots) {
      const timeline = snapshot.timeline as Array<{ sequence: number }>;
      expect(timeline.at(-1)?.sequence ?? 0).toBe(snapshot.lastSequence);
    }
    expect(database.snapshots[0]?.data).toMatchObject({
      activeRun: expect.objectContaining({ status: 'completed' }),
      lastSequence: 2,
    });
  });
});
