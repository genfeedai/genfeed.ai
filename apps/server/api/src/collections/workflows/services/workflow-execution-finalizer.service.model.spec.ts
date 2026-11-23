vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

import { WorkflowExecutionFinalizerService } from '@api/collections/workflows/services/workflow-execution-finalizer.service';
import {
  explore,
  type Scenario,
  type Simulation,
} from '@api-test/model-checking/interleaving-explorer';
import { WorkflowExecutionStatus, WorkflowStatus } from '@genfeedai/contracts';
import type { ExecutionRunResult } from '@genfeedai/workflows/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');

/**
 * Every run of a workflow shares one `Workflow.status`. The finalizer marked
 * the workflow COMPLETED as soon as its own run ended, so with two runs in
 * flight the first to finish hid the one still running, and a run that started
 * while another finished could be stamped over (#10402). This model runs the
 * real finalizer against two executions of one workflow, with every statement
 * an atomic step, and states the harm: a workflow that reads terminal while an
 * execution is RUNNING, or that still reads RUNNING once nothing is.
 *
 * The unfixed scenarios replay the code before the fix: the terminal write
 * unconditional, and the same check done as a read before a plain write.
 */

const ORG = 'org-1';
const WORKFLOW = 'wf-1';

type ExecutionId = 'e1' | 'e2';
type Transaction = {
  execBase: number | null;
  staged: { status: string } | null;
  workflowBase: number | null;
};

function createWorld(
  sim: Simulation,
  initial: Record<ExecutionId, WorkflowExecutionStatus>,
) {
  const executions: Record<ExecutionId, WorkflowExecutionStatus> = {
    ...initial,
  };
  let executionVersion = 0;
  const workflow = { status: WorkflowStatus.RUNNING as string, version: 0 };
  const serializationFailure = () =>
    Object.assign(new Error('serialization failure'), { code: 'P2034' });

  /** A client over the rows; a transaction reads one snapshot and writes only if nothing it touched changed. */
  const client = (transaction: Transaction | null) => ({
    workflow: {
      update: async ({ data }: { data: { status: string } }) => {
        await sim.step(`write the workflow ${data.status}`);
        if (transaction) {
          // First updater wins: the row changed after this snapshot began.
          if (
            transaction.workflowBase !== null &&
            transaction.workflowBase !== workflow.version
          ) {
            throw serializationFailure();
          }
          transaction.staged = { status: data.status };
        } else {
          workflow.status = data.status;
          workflow.version += 1;
        }
        return {};
      },
    },
    workflowExecution: {
      count: async ({
        where,
      }: {
        where: { id: { not: string }; status: string };
      }) => {
        await sim.step('count the running executions');
        if (transaction && transaction.execBase === null) {
          transaction.execBase = executionVersion;
          transaction.workflowBase = workflow.version;
        }
        const count = (Object.keys(executions) as ExecutionId[]).filter(
          (id) => id !== where.id.not && executions[id] === where.status,
        ).length;
        sim.observed(count);
        return count;
      },
    },
  });

  const prisma = {
    ...client(null),
    $transaction: async <T>(
      work: (tx: ReturnType<typeof client>) => Promise<T>,
    ): Promise<T> => {
      const transaction: Transaction = {
        execBase: null,
        staged: null,
        workflowBase: null,
      };
      const result = await work(client(transaction));
      await sim.step('commit');
      // The count read the executions: a start that committed since is a
      // read-write conflict, and Postgres aborts one of the two.
      if (
        transaction.execBase !== null &&
        transaction.execBase !== executionVersion
      ) {
        throw serializationFailure();
      }
      if (
        transaction.workflowBase !== null &&
        transaction.workflowBase !== workflow.version
      ) {
        throw serializationFailure();
      }
      if (transaction.staged) {
        workflow.status = transaction.staged.status;
        workflow.version += 1;
      }
      return result;
    },
  };

  const setExecution = (id: ExecutionId, status: WorkflowExecutionStatus) => {
    executions[id] = status;
    executionVersion += 1;
  };

  return { executions, prisma, setExecution, workflow };
}

type World = ReturnType<typeof createWorld>;

function runResult(): ExecutionRunResult {
  return {
    completedAt: new Date(0),
    nodeResults: new Map(),
    runId: 'run',
    startedAt: new Date(0),
    status: 'completed',
    totalCreditsUsed: 0,
    workflowId: WORKFLOW,
  } as ExecutionRunResult;
}

/** The real finalizer, with `completeExecution` as one atomic step. */
function finalize(sim: Simulation, world: World, id: ExecutionId) {
  const finalizer = new WorkflowExecutionFinalizerService(
    world.prisma as never,
    {
      completeExecution: async () => {
        await sim.step(`complete ${id}`);
        world.setExecution(id, WorkflowExecutionStatus.COMPLETED);
        return { organizationId: ORG };
      },
    } as never,
    { findFirstFailedNodeId: () => undefined } as never,
  );
  return finalizer.finalizeExecution({
    completedAt: new Date(0),
    executionId: id,
    finalStatus: WorkflowExecutionStatus.COMPLETED,
    organizationId: ORG,
    result: runResult(),
    workflowId: WORKFLOW,
    workflowStatus: WorkflowStatus.COMPLETED,
  });
}

/** What the runner does when a run starts: the execution row, then the workflow. */
async function startRun(sim: Simulation, world: World, id: ExecutionId) {
  await sim.step(`start ${id}`);
  world.setExecution(id, WorkflowExecutionStatus.RUNNING);
  await world.prisma.workflow.update({
    data: { status: WorkflowStatus.RUNNING },
  });
}

/** The finalizer before the fix: the terminal status written without looking at the other runs. */
async function finalizeUnfixed(sim: Simulation, world: World, id: ExecutionId) {
  await sim.step(`complete ${id}`);
  world.setExecution(id, WorkflowExecutionStatus.COMPLETED);
  await world.prisma.workflow.update({
    data: { status: WorkflowStatus.COMPLETED },
  });
}

/** A fix that reads the other runs first and writes in a separate statement. */
async function finalizeReadThenWrite(
  sim: Simulation,
  world: World,
  id: ExecutionId,
) {
  await sim.step(`complete ${id}`);
  world.setExecution(id, WorkflowExecutionStatus.COMPLETED);
  const others = await world.prisma.workflowExecution.count({
    where: { id: { not: id }, status: WorkflowExecutionStatus.RUNNING },
  });
  if (others === 0) {
    await world.prisma.workflow.update({
      data: { status: WorkflowStatus.COMPLETED },
    });
  }
}

function anyRunning(world: World): boolean {
  return Object.values(world.executions).includes(
    WorkflowExecutionStatus.RUNNING,
  );
}

/** The harm, stated over the stored rows once nothing is left to run. */
function wrongStatus(world: World): string | null {
  const running = anyRunning(world);
  if (running && world.workflow.status !== WorkflowStatus.RUNNING) {
    return `the workflow reads ${world.workflow.status} while an execution is still running`;
  }
  if (!running && world.workflow.status !== WorkflowStatus.COMPLETED) {
    return `the workflow still reads ${world.workflow.status} after every execution finished`;
  }
  return null;
}

type Plan = {
  /** What each actor does against the world. */
  actors: (
    sim: Simulation,
    world: World,
  ) => Array<[string, () => Promise<unknown>]>;
  initial: Record<ExecutionId, WorkflowExecutionStatus>;
  /** Also fail the moment a terminal status sits beside a running execution. */
  checkEveryStep: boolean;
};

function scenario(plan: Plan): () => Scenario {
  return () => {
    vi.clearAllTimers();
    vi.setSystemTime(0);
    let world: World;
    return {
      final: () => wrongStatus(world),
      invariant: () => {
        if (!plan.checkEveryStep) return null;
        return anyRunning(world) &&
          world.workflow.status !== WorkflowStatus.RUNNING
          ? `the workflow reads ${world.workflow.status} while an execution is still running`
          : null;
      },
      snapshot: () =>
        JSON.stringify([
          world.executions,
          world.workflow,
          Date.now(),
          vi.getTimerCount(),
        ]),
      start: (sim) => {
        world = createWorld(sim, plan.initial);
        sim.environment(
          'time passes',
          () => vi.getTimerCount() > 0,
          () => {
            vi.advanceTimersByTime(1000);
          },
        );
        for (const [name, run] of plan.actors(sim, world)) {
          sim.spawn(name, run);
        }
      },
    };
  };
}

const BOTH_RUNNING = {
  e1: WorkflowExecutionStatus.RUNNING,
  e2: WorkflowExecutionStatus.RUNNING,
};
const SECOND_QUEUED = {
  e1: WorkflowExecutionStatus.RUNNING,
  e2: WorkflowExecutionStatus.PENDING,
};

describe('workflow status against concurrent runs (#10402)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('replays the unfixed write: the first run to finish hides the one still running', async () => {
    const result = await explore(
      scenario({
        actors: (sim, world) => [
          ['run 1', () => finalizeUnfixed(sim, world, 'e1')],
          ['run 2', () => finalizeUnfixed(sim, world, 'e2')],
        ],
        checkEveryStep: true,
        initial: BOTH_RUNNING,
      }),
    );

    expect(result.violation).toEqual({
      message: `the workflow reads ${WorkflowStatus.COMPLETED} while an execution is still running`,
      trace: [
        'run 1: complete e1',
        `run 1: write the workflow ${WorkflowStatus.COMPLETED}`,
      ],
    });
  });

  it('replays a check outside the transaction: a run that starts in between is stamped over', async () => {
    const result = await explore(
      scenario({
        actors: (sim, world) => [
          ['finishing run', () => finalizeReadThenWrite(sim, world, 'e1')],
          ['starting run', () => startRun(sim, world, 'e2')],
        ],
        checkEveryStep: false,
        initial: SECOND_QUEUED,
      }),
    );

    expect(result.violation).toEqual({
      message: `the workflow reads ${WorkflowStatus.COMPLETED} while an execution is still running`,
      trace: [
        'finishing run: complete e1',
        'finishing run: count the running executions',
        'starting run: start e2',
        `starting run: write the workflow ${WorkflowStatus.RUNNING}`,
        `finishing run: write the workflow ${WorkflowStatus.COMPLETED}`,
      ],
    });
  });

  it('keeps the workflow RUNNING until the last of two running runs finishes', async () => {
    const result = await explore(
      scenario({
        actors: (sim, world) => [
          ['run 1', () => finalize(sim, world, 'e1')],
          ['run 2', () => finalize(sim, world, 'e2')],
        ],
        checkEveryStep: true,
        initial: BOTH_RUNNING,
      }),
    );

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(5);
  });

  it('never stamps a run that starts while another finishes', async () => {
    const result = await explore(
      scenario({
        actors: (sim, world) => [
          ['finishing run', () => finalize(sim, world, 'e1')],
          ['starting run', () => startRun(sim, world, 'e2')],
        ],
        checkEveryStep: false,
        initial: SECOND_QUEUED,
      }),
    );

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(5);
  });
});
