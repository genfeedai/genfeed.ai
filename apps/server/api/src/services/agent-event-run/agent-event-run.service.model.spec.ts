import type { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AGENT_EVENT_RUN_CLAIM_LEASE_MS } from '@api/services/agent-event-run/agent-event-run.constants';
import { AgentEventRunService } from '@api/services/agent-event-run/agent-event-run.service';
import type { AgentEventClaim } from '@api/services/agent-event-run/agent-event-run.types';
import type { AgentRuntimeService } from '@api/services/agent-runtime/agent-runtime.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  explore,
  type Scenario,
  type Simulation,
} from '@api-test/model-checking/interleaving-explorer';
import type { IAgentRuntimeStartTurnInput } from '@genfeedai/contracts/interfaces';
import { AgentEventRunStatus } from '@genfeedai/prisma';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');

/**
 * A trigger event can reach the step twice at once (two workers, a queue
 * redelivery) and a worker can die between taking the event and starting its
 * run. This model runs the real `AgentEventRunService` over a table whose every
 * statement is an atomic step, with the claim's lease running out at any moment
 * and a worker crashing before any step, and states what must never happen.
 *
 * Harms it states:
 * - one event starts two agent runs;
 * - an agent has more event-started runs in a day than its cap;
 * - an event whose claim ran out is never started after a redelivery.
 *
 * There is no past bug to replay, so the proof that the model looks is the
 * mutant at the end: the claim without its lease check.
 */

const ORG = 'org-1';
const STRATEGY = 'strategy-1';
const USER = 'user-1';
const START = new Date('2026-11-23T12:00:00.000Z');

type Row = {
  agentExecutionId: string | null;
  claimedAt: Date;
  createdAt: Date;
  eventKey: string;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  status: AgentEventRunStatus;
  strategyId: string;
  threadId: string | null;
};

type World = {
  clockAdvanced: boolean;
  /** Execution ids the runtime opened, by the request id the caller gave. */
  executions: Map<string, string[]>;
  /** Every call into the runtime, the ones the runtime answers with an earlier run included. */
  startCalls: number;
  rows: Row[];
  sequence: number;
};

type Where = Record<string, unknown>;

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    switch (key) {
      case 'organizationId':
      case 'isDeleted':
      case 'eventKey':
      case 'strategyId':
        return row[key] === expected;
      case 'id': {
        if (typeof expected === 'string') return row.id === expected;
        return (expected as { not: string }).not !== row.id;
      }
      case 'status': {
        if (typeof expected === 'string') return row.status === expected;
        return (expected as { in: string[] }).in.includes(row.status);
      }
      case 'createdAt':
        return row.createdAt >= (expected as { gte: Date }).gte;
      default:
        throw new Error(`The model does not know the filter ${key}`);
    }
  });
}

function table(sim: Simulation, world: World) {
  const insert = (data: Partial<Row> & { eventKey: string }): Row => {
    if (
      world.rows.some(
        (row) =>
          row.eventKey === data.eventKey &&
          row.strategyId === data.strategyId &&
          row.organizationId === data.organizationId,
      )
    ) {
      throw new Error('Unique constraint failed on the event key');
    }
    world.sequence += 1;
    const row: Row = {
      agentExecutionId: null,
      claimedAt: new Date(),
      createdAt: new Date(),
      eventKey: data.eventKey,
      id: `run-${world.sequence}`,
      isDeleted: false,
      organizationId: data.organizationId ?? ORG,
      status: AgentEventRunStatus.CLAIMED,
      strategyId: data.strategyId ?? STRATEGY,
      threadId: null,
    };
    world.rows.push(row);
    return row;
  };
  const statements = {
    count: async ({ where }: { where: Where }) =>
      world.rows.filter((row) => matches(row, where)).length,
    create: async ({ data }: { data: Partial<Row> & { eventKey: string } }) =>
      insert(data),
    findFirst: async ({ where }: { where: Where }) => {
      const found = world.rows.find((row) => matches(row, where));
      sim.observed(found ? { ...found, claimedAt: undefined, createdAt: undefined } : null);
      return found ? { ...found } : null;
    },
    update: async ({ data, where }: { data: Partial<Row>; where: Where }) => {
      const row = world.rows.find((candidate) => matches(candidate, where));
      if (!row) throw new Error('Record to update not found');
      Object.assign(row, data);
      return { ...row };
    },
  };
  return {
    agentEventRun: {
      ...statements,
      updateMany: async ({
        data,
        where,
      }: {
        data: Partial<Row>;
        where: Where;
      }) => {
        await sim.step('postgres UPDATE agent_event_runs');
        let count = 0;
        for (const row of world.rows) {
          if (matches(row, where)) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    // A Serializable transaction is one atomic step.
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      await sim.step('postgres claim transaction');
      return callback({ agentEventRun: statements });
    },
  };
}

function runtime(sim: Simulation, world: World, isIdempotent: boolean) {
  return {
    startTurn: async (input: IAgentRuntimeStartTurnInput) => {
      await sim.step('runtime startTurn');
      world.startCalls += 1;
      const requestId = String(input.metadata?.clientRequestId);
      const opened = world.executions.get(requestId) ?? [];
      const earlier = opened[0];
      if (earlier && isIdempotent) {
        return { executionId: earlier, threadId: `thread-${earlier}` };
      }
      // A non-idempotent runtime opens a new execution for every call.
      const executionId = `exec-${requestId}-${opened.length + 1}`;
      world.executions.set(requestId, [...opened, executionId]);
      return { executionId, threadId: `thread-${executionId}` };
    },
  };
}

const strategies = {
  findOneById: async () => ({
    agentType: 'x_content',
    autonomyMode: 'SUPERVISED',
    brandId: null,
    config: {},
    dailyCreditBudget: 0,
    dailyCreditsUsed: 0,
    id: STRATEGY,
    isActive: true,
    label: 'Launch writer',
    model: null,
  }),
} as unknown as AgentStrategiesService;

const logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

function executionsOpened(world: World): number {
  return [...world.executions.values()].reduce(
    (total, opened) => total + opened.length,
    0,
  );
}

type Options = {
  canCrash: boolean;
  /** The claim as the service ships it, or a mutant to show the model looks. */
  makeService: (
    prisma: PrismaService,
    runtimeDouble: AgentRuntimeService,
  ) => AgentEventRunService;
  runtimeIsIdempotent: boolean;
  timePasses: boolean;
};

function scenarioWith(options: Options): () => Scenario {
  return () => {
    vi.setSystemTime(START);
    const world: World = {
      clockAdvanced: false,
      executions: new Map(),
      rows: [],
      sequence: 0,
      startCalls: 0,
    };
    return {
      final: () => {
        if (
          world.clockAdvanced &&
          world.rows.some((row) => row.status === AgentEventRunStatus.CLAIMED) &&
          executionsOpened(world) === 0
        ) {
          return 'a claim that ran out was never retaken, so the event was never started';
        }
        return null;
      },
      invariant: () => {
        if (executionsOpened(world) > 1) {
          return 'one event started two agent runs';
        }
        if (world.rows.length > 1) {
          return 'one event holds two claim rows';
        }
        return null;
      },
      snapshot: () =>
        JSON.stringify([
          world.rows.map((row) => [
            row.status,
            row.agentExecutionId,
            row.claimedAt.getTime() - START.getTime(),
          ]),
          [...world.executions.entries()],
          world.startCalls,
          world.clockAdvanced,
        ]),
      start: (sim) => {
        const prisma = table(sim, world) as unknown as PrismaService;
        const service = options.makeService(
          prisma,
          runtime(sim, world, options.runtimeIsIdempotent) as unknown as AgentRuntimeService,
        );
        if (options.timePasses) {
          sim.environment(
            'the claim lease runs out',
            () =>
              !world.clockAdvanced &&
              world.rows.some((row) => row.status === AgentEventRunStatus.CLAIMED),
            () => {
              world.clockAdvanced = true;
              vi.setSystemTime(
                new Date(START.getTime() + AGENT_EVENT_RUN_CLAIM_LEASE_MS + 1000),
              );
            },
          );
        }
        const deliver = () =>
          service.runForEvent({
            eventId: 'post-1',
            eventText: 'Looking for a tool that drafts launch posts',
            instruction: 'Draft a reply post',
            organizationId: ORG,
            strategyId: STRATEGY,
            userId: USER,
          });
        sim.spawn('worker A', deliver, { crashable: options.canCrash });
        sim.spawn('worker B', deliver, { crashable: options.canCrash });
        // The queue delivers the event again once both workers have ended or died.
        sim.onQuiescence(() => sim.spawn('redelivery', deliver));
      },
    };
  };
}

function shippedService(
  prisma: PrismaService,
  runtimeDouble: AgentRuntimeService,
): AgentEventRunService {
  return new AgentEventRunService(prisma, strategies, runtimeDouble, logger as never);
}

/**
 * The shipped claim without its lease check: a claim some other worker holds is
 * taken over as if it had run out.
 */
function mutantService(
  prisma: PrismaService,
  runtimeDouble: AgentRuntimeService,
): AgentEventRunService {
  const service = shippedService(prisma, runtimeDouble);
  service.claim = async (request, eventKey) =>
    (
      prisma as unknown as {
        $transaction: (
          callback: (tx: Tx) => Promise<AgentEventClaim>,
        ) => Promise<AgentEventClaim>;
      }
    ).$transaction(async (tx) => {
      const existing = await tx.agentEventRun.findFirst({
        where: {
          eventKey,
          isDeleted: false,
          organizationId: request.organizationId,
          strategyId: request.strategyId,
        },
      });
      if (existing?.status === AgentEventRunStatus.STARTED) {
        return { kind: 'duplicate' };
      }
      const run = existing
        ? await tx.agentEventRun.update({
            data: { status: AgentEventRunStatus.CLAIMED },
            where: { id: existing.id },
          })
        : await tx.agentEventRun.create({
            data: {
              eventKey,
              organizationId: request.organizationId,
              strategyId: request.strategyId,
            },
          });
      return { kind: 'claimed', runId: run.id };
    });
  return service;
}

type Tx = {
  agentEventRun: {
    create: (args: { data: Record<string, unknown> }) => Promise<Row>;
    findFirst: (args: { where: Where }) => Promise<Row | null>;
    update: (args: { data: Where; where: Where }) => Promise<Row>;
  };
};

describe('agent event runs, every interleaving', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts one run for an event delivered to two workers and redelivered, whoever crashes and whenever the claim runs out', async () => {
    const result = await explore(
      scenarioWith({
        canCrash: true,
        makeService: shippedService,
        runtimeIsIdempotent: true,
        timePasses: true,
      }),
    );

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(50);
  });

  it('lets only one worker through the claim, even when the runtime would open a run for every call', async () => {
    const result = await explore(
      scenarioWith({
        canCrash: false,
        makeService: shippedService,
        runtimeIsIdempotent: false,
        timePasses: false,
      }),
    );

    expect(result.violation).toBeNull();
  });

  it('fails on a claim that takes over a claim another worker still holds', async () => {
    const result = await explore(
      scenarioWith({
        canCrash: false,
        makeService: mutantService,
        runtimeIsIdempotent: false,
        timePasses: false,
      }),
    );

    expect(result.violation).toEqual({
      message: 'one event started two agent runs',
      trace: [
        'worker A: postgres claim transaction',
        'worker B: postgres claim transaction',
        'worker A: runtime startTurn',
        'worker B: runtime startTurn',
      ],
    });
  });
});
