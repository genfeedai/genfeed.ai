vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import type { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import type { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import { AgentThreadStatusPublisherService } from '@api/services/agent-threading/services/agent-thread-status-publisher.service';
import type { AgentThreadEventType } from '@api/services/agent-threading/types/agent-thread.types';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentThreadStatus } from '@genfeedai/contracts';
import {
  AGENT_CHAT_CHANNEL,
  AGENT_THREAD_STATUS_EVENT_TYPE,
} from '@genfeedai/contracts/constants';
import type { AgentThreadStatusEvent } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orgId = 'a'.repeat(24);
const otherOrgId = 'd'.repeat(24);
const threadId = 'b'.repeat(24);
const userId = 'c'.repeat(24);
const runId = 'run-1';

type Row = Record<string, unknown> & { id: string };

/** Single-connection in-memory stand-in for the tables the engine writes. */
function createDatabase() {
  let nextId = 0;
  const events: Row[] = [];
  const snapshots: Row[] = [];
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  const client = {
    agentThreadEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: `event-${++nextId}` };
        events.push(row);
        return row;
      }),
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          events.find((row) => matches(row, where)) ?? null,
      ),
    },
    agentThreadSnapshot: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: `snapshot-${++nextId}` };
        snapshots.push(row);
        return row;
      }),
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          snapshots.find((row) => matches(row, where)) ?? null,
      ),
      findMany: vi.fn(
        async ({ where }: { where: { threadId: { in: string[] } } }) =>
          snapshots.filter((row) =>
            where.threadId.in.includes(row.threadId as string),
          ),
      ),
      update: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: Record<string, unknown>;
        }) => {
          const index = snapshots.findIndex((row) => matches(row, where));
          snapshots[index] = { ...snapshots[index], ...data } as Row;
          return snapshots[index];
        },
      ),
    },
  };

  return {
    ...client,
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: async <T>(run: (tx: typeof client) => Promise<T>) =>
      run(client),
    agentThread: { findMany: vi.fn() },
    brand: { findMany: vi.fn().mockResolvedValue([]) },
    ingredient: { findMany: vi.fn().mockResolvedValue([]) },
    snapshots,
  };
}

describe('AgentThreadStatusPublisherService', () => {
  let database: ReturnType<typeof createDatabase>;
  let publish: ReturnType<typeof vi.fn>;
  let threadsService: AgentThreadsService;
  let engine: AgentThreadEngineService;
  let publisher: AgentThreadStatusPublisherService;
  let thread: Record<string, unknown> | null;
  let sequence: number;

  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const publishedEvents = (): AgentThreadStatusEvent[] =>
    publish.mock.calls
      .filter(([channel]) => channel === AGENT_CHAT_CHANNEL)
      .map(
        ([, message]) =>
          (message as { data: AgentThreadStatusEvent; type: string }).data,
      );

  const record = (
    type: AgentThreadEventType,
    payload: Record<string, unknown> = {},
    overrides: { commandId?: string; runId?: string } = {},
  ) => {
    sequence += 1;
    return engine.appendEvent({
      commandId: overrides.commandId ?? `cmd-${sequence}`,
      organizationId: orgId,
      payload,
      runId: overrides.runId ?? runId,
      threadId,
      type,
      userId,
    });
  };

  beforeEach(() => {
    sequence = 0;
    database = createDatabase();
    publish = vi.fn().mockResolvedValue(undefined);
    thread = {
      id: threadId,
      isDeleted: false,
      organizationId: orgId,
      source: 'agent',
      status: AgentThreadStatus.ACTIVE,
      title: 'Thread',
      userId,
    };

    threadsService = new AgentThreadsService(
      database as unknown as PrismaService,
      logger,
      {} as AgentMessagesService,
    );
    vi.spyOn(threadsService, 'findOne').mockImplementation(
      async () => thread as never,
    );

    publisher = new AgentThreadStatusPublisherService(
      { publish } as unknown as RedisService,
      threadsService,
      logger,
    );
    engine = new AgentThreadEngineService(
      database as unknown as PrismaService,
      threadsService,
      {} as AgentMemoriesService,
      {
        markCancelled: vi.fn(),
        upsertBinding: vi.fn(),
      } as unknown as AgentRuntimeSessionService,
      new AgentThreadProjectorService(),
      logger,
      undefined,
      publisher,
    );
  });

  it('publishes one event per run status change, with the thread sequence', async () => {
    const turnRequested = await record('thread.turn_requested');
    await record('tool.started', { toolCallId: 't1' });
    await record('tool.progress', { toolCallId: 't1' });
    await record('tool.completed', { toolCallId: 't1' });
    const inputRequested = await record('input.requested', {
      requestId: 'r1',
    });
    const inputResolved = await record('input.resolved', { requestId: 'r1' });
    await record('assistant.delta', { delta: 'x' });
    const completed = await record('run.completed');
    await record('assistant.finalized', { content: 'done' });

    const events = publishedEvents();
    expect(
      events.map(({ pendingInputCount, runStatus, sequence: seq }) => ({
        pendingInputCount,
        runStatus,
        sequence: seq,
      })),
    ).toEqual([
      { pendingInputCount: 0, runStatus: 'running', sequence: 1 },
      { pendingInputCount: 1, runStatus: 'waiting_input', sequence: 5 },
      { pendingInputCount: 0, runStatus: 'running', sequence: 6 },
      { pendingInputCount: 0, runStatus: 'completed', sequence: 8 },
    ]);
    expect(events.map((event) => event.sequence)).toEqual([
      turnRequested.sequence,
      inputRequested.sequence,
      inputResolved.sequence,
      completed.sequence,
    ]);
    expect(events[1]).toMatchObject({
      organizationId: orgId,
      runtimeState: 'awaiting_input',
      threadId,
      userId,
    });
    expect(publish).toHaveBeenCalledWith(AGENT_CHAT_CHANNEL, {
      data: events[0],
      type: AGENT_THREAD_STATUS_EVENT_TYPE,
    });
  });

  it('publishes nothing for events that leave the run status unchanged', async () => {
    await record('thread.turn_requested');
    // queued -> running moves the snapshot but not the derived status.
    await record('tool.started', { toolCallId: 't1' });
    expect(publishedEvents()).toHaveLength(1);
    publish.mockClear();
    vi.mocked(threadsService.findOne).mockClear();

    await record('tool.progress', { toolCallId: 't1' });
    await record('work.updated');
    await record('ui.blocks_updated');

    expect(publish).not.toHaveBeenCalled();
    // Only the engine's own access check per event: the publisher never
    // looks the thread up for events that leave the status inputs untouched.
    expect(threadsService.findOne).toHaveBeenCalledTimes(3);
  });

  it('publishes nothing when a recorded command is replayed', async () => {
    await record('thread.turn_requested', {}, { commandId: 'turn-1' });
    publish.mockClear();

    await record('thread.turn_requested', {}, { commandId: 'turn-1' });

    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps the pushed sequence strictly increasing across a run', async () => {
    await record('thread.turn_requested');
    await record('input.requested', { requestId: 'r1' });
    await record('input.resolved', { requestId: 'r1' });
    await record('input.requested', { requestId: 'r2' });
    await record('input.resolved', { requestId: 'r2' });
    await record('run.failed');

    const sequences = publishedEvents().map((event) => event.sequence);
    expect(sequences.length).toBeGreaterThanOrEqual(6);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(new Set(sequences).size).toBe(sequences.length);
  });

  it('agrees with the thread list for every status it pushes', async () => {
    const listedState = async () => {
      (
        database.agentThread.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([thread]);
      const [listed] = await threadsService.getUserThreads(
        userId,
        orgId,
        AgentThreadStatus.ACTIVE,
      );
      return {
        pendingInputCount: listed.pendingInputCount,
        runStatus: listed.runStatus,
        runtimeState: listed.runtimeState,
      };
    };

    const steps: AgentThreadEventType[] = [
      'thread.turn_requested',
      'input.requested',
      'input.resolved',
      'run.completed',
    ];
    for (const step of steps) {
      publish.mockClear();
      await record(step, { requestId: 'r1' });
      const [pushed] = publishedEvents();
      expect(pushed).toBeDefined();
      expect({
        pendingInputCount: pushed.pendingInputCount,
        runStatus: pushed.runStatus,
        runtimeState: pushed.runtimeState,
      }).toEqual(await listedState());
    }
  });

  it('publishes nothing for an archived thread', async () => {
    thread = { ...thread, status: AgentThreadStatus.ARCHIVED };

    await record('thread.turn_requested');
    await record('run.completed');

    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes nothing for a deleted thread', async () => {
    thread = { ...thread, isDeleted: true };

    await record('thread.turn_requested');
    await record('run.completed');

    expect(publish).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('looks the thread up inside its own organization only', async () => {
    await record('thread.turn_requested');

    expect(threadsService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ isDeleted: false, organizationId: orgId }),
    );
    expect(threadsService.findOne).not.toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: otherOrgId }),
    );
    expect(publishedEvents().every((e) => e.organizationId === orgId)).toBe(
      true,
    );
  });

  it('does not fail the recorded event when publishing fails', async () => {
    publish.mockRejectedValue(new Error('redis down'));

    await expect(record('thread.turn_requested')).resolves.toMatchObject({
      sequence: 1,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to publish thread status'),
      expect.objectContaining({ error: 'redis down', threadId }),
    );
  });
});
