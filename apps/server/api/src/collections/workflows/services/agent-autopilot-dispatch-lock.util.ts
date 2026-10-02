import { createHash } from 'node:crypto';
import type { AgentStrategyPerformanceSnapshot } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.types';
import { isAgentStrategyDue } from '@api/collections/agent-strategies/services/agent-strategy-due.util';
import type {
  AgentStrategyConfig,
  AgentStrategySnapshot,
  AgentWorkflowHandoffContext,
} from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { PROACTIVE_AGENT_TURN_SOURCE } from '@api/collections/workflows/system-workflow-definition';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { scopedWhere } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type AgentRunFrequency,
  normalizeAgentAutonomyMode,
} from '@genfeedai/contracts';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import {
  type Prisma,
  WorkflowExecutionStatus as PrismaWorkflowExecutionStatus,
} from '@genfeedai/prisma';
import {
  createPrismaPgConfig,
  POSTGRES_CA_FILE_ENV_KEYS,
} from '@libs/prisma/prisma-pg-config';
import { Client } from 'pg';

export type ProactiveDispatchDatabaseConfig = {
  get(key: string): string | undefined;
};
export type ProactiveDispatchOwnership = {
  assertOwned(): void;
  verifyOwned(): Promise<void>;
};

type ProactiveDispatchContext = {
  prisma: PrismaService;
  workflowRunner: Pick<SystemWorkflowRunnerService, 'enqueueWorkflow'>;
  performanceService: {
    getPerformanceSnapshot(
      strategyId: string,
      organizationId: string,
      period: 'weekly',
    ): Promise<AgentStrategyPerformanceSnapshot>;
  };
  readStrategySnapshot(value: unknown): AgentStrategySnapshot;
  readRecord(value: unknown): Record<string, unknown>;
  parseDate(value: unknown): Date | null;
  pendingDispatchWhere(
    organizationId: string,
    strategyIds: string[],
  ): Prisma.WorkflowExecutionWhereInput;
  resolveDispatchBudget(
    strategy: AgentStrategySnapshot,
    config: AgentStrategyConfig,
    ownership: ProactiveDispatchOwnership,
  ): Promise<number | null>;
  buildSyntheticUserMessage(
    strategy: AgentStrategySnapshot,
    remainingBudget: number,
    snapshot: AgentStrategyPerformanceSnapshot,
  ): Promise<string>;
  resolveStrategyThread(
    strategy: AgentStrategySnapshot,
    ownership: ProactiveDispatchOwnership,
  ): Promise<{ id: string }>;
  scheduleNextRun(
    strategyId: string,
    frequency: AgentRunFrequency | undefined,
    retryInMinutes: number | undefined,
    ownership: ProactiveDispatchOwnership,
  ): Promise<void>;
  recordStrategyFailure(
    strategy: AgentStrategySnapshot,
    config: AgentStrategyConfig,
    error: unknown,
    dispatchId: string,
    ownership: ProactiveDispatchOwnership,
  ): Promise<void>;
  buildExecutionMetadata(
    strategy: AgentStrategySnapshot,
    handoff?: AgentWorkflowHandoffContext,
  ): Record<string, unknown> | undefined;
};

export class ProactiveDispatchOwnershipError extends Error {
  constructor(cause?: unknown) {
    super('Proactive dispatch ownership was lost', { cause });
    this.name = 'ProactiveDispatchOwnershipError';
  }
}

export async function withProactiveDispatchLock<T>(
  config: ProactiveDispatchDatabaseConfig,
  organizationId: string,
  strategyId: string,
  run: (ownership: ProactiveDispatchOwnership) => Promise<T>,
): Promise<T | null> {
  const connectionString = config.get('DATABASE_URL');
  if (typeof connectionString !== 'string' || !connectionString)
    throw new Error('DATABASE_URL environment variable is not set');
  const client = new Client(
    createPrismaPgConfig(connectionString, {
      caFilePaths: POSTGRES_CA_FILE_ENV_KEYS.map((key) => config.get(key)),
    }),
  );
  return withPinnedProactiveDispatchClient(
    createPinnedDispatchConnection(client),
    `agent-proactive-dispatch:${organizationId}:${strategyId}`,
    run,
  );
}

export type ProactiveDispatchConnection = {
  connect(): Promise<void>;
  acquire(key: string): Promise<{ acquired: boolean; pid: number }>;
  verify(key: string, backendPid: number): Promise<boolean>;
  release(key: string): Promise<boolean>;
  end(): Promise<void>;
  onFailure(listener: (cause?: unknown) => void): void;
  offFailure(listener: (cause?: unknown) => void): void;
};

function createPinnedDispatchConnection(
  client: Client,
): ProactiveDispatchConnection {
  return {
    connect: async () => {
      await client.connect();
    },
    acquire: async (key) => {
      const result = await client.query<{ acquired: boolean; pid: number }>(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired, pg_backend_pid() AS pid',
        [key],
      );
      const row = result.rows[0];
      if (!row) throw new ProactiveDispatchOwnershipError();
      return row;
    },
    verify: async (key, backendPid) => {
      const result = await client.query<{ owned: boolean }>(
        `
        SELECT pg_backend_pid() = $2 AND EXISTS (
          SELECT 1 FROM pg_locks
          WHERE locktype = 'advisory' AND granted AND pid = pg_backend_pid()
            AND classid = ((hashtextextended($1, 0) >> 32) & 4294967295)::oid
            AND objid = (hashtextextended($1, 0) & 4294967295)::oid
            AND objsubid = 1
        ) AS owned`,
        [key, backendPid],
      );
      return result.rows[0]?.owned === true;
    },
    release: async (key) => {
      const result = await client.query<{ released: boolean }>(
        'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released',
        [key],
      );
      return result.rows[0]?.released === true;
    },
    end: () => client.end(),
    onFailure: (listener) => {
      client.on('error', listener);
      client.on('end', listener);
    },
    offFailure: (listener) => {
      client.off('error', listener);
      client.off('end', listener);
    },
  };
}

// This client belongs exclusively to one call and is always closed here.
export async function withPinnedProactiveDispatchClient<T>(
  client: ProactiveDispatchConnection,
  key: string,
  run: (ownership: ProactiveDispatchOwnership) => Promise<T>,
): Promise<T | null> {
  let acquired = false;
  let closing = false;
  let lost: ProactiveDispatchOwnershipError | undefined;
  let backendPid = 0;
  const failOwnership = (cause?: unknown) => {
    if (!closing && !lost) lost = new ProactiveDispatchOwnershipError(cause);
  };
  const assertOwned = () => {
    if (lost) throw lost;
    if (!acquired) throw new ProactiveDispatchOwnershipError();
  };
  const verifyOwned = async () => {
    assertOwned();
    try {
      if (!(await client.verify(key, backendPid))) failOwnership();
    } catch (error) {
      failOwnership(error);
    }
    assertOwned();
  };
  client.onFailure(failOwnership);
  let result: T | null = null;
  const failures: unknown[] = [];
  try {
    await client.connect();
    if (lost) throw lost;
    const lock = await client.acquire(key);
    if (lost) throw lost;
    acquired = lock.acquired === true;
    backendPid = lock.pid;
    if (acquired) {
      if (!Number.isInteger(backendPid))
        throw new ProactiveDispatchOwnershipError();
      result = await run({ assertOwned, verifyOwned });
      await verifyOwned();
    }
  } catch (error) {
    failures.push(error);
  }
  if (acquired && !lost) {
    try {
      if (!(await client.release(key)))
        throw new ProactiveDispatchOwnershipError();
    } catch (error) {
      failures.push(error);
    }
  }
  if (lost && !failures.includes(lost)) failures.push(lost);
  closing = true;
  try {
    await client.end();
  } catch (error) {
    failures.push(error);
  } finally {
    client.offFailure(failOwnership);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'Proactive dispatch and cleanup failed');
  return result;
}

async function dispatchStillCurrent(
  context: ProactiveDispatchContext,
  strategy: AgentStrategySnapshot,
  ownership: ProactiveDispatchOwnership,
  recovery = false,
): Promise<boolean> {
  const current = await context.prisma.agentStrategy.findFirst({
    where: scopedWhere(strategy.organizationId, {
      id: strategy.id,
      isActive: true,
    }),
  });
  ownership.assertOwned();
  if (!current) return false;
  const latest = context.readStrategySnapshot(current);
  return (
    latest.brandId === strategy.brandId &&
    latest.userId === strategy.userId &&
    isAgentStrategyDue(
      { ...latest.config, nextRunAt: undefined },
      new Date(),
    ) &&
    (recovery ||
      (latest.config.nextRunAt === strategy.config.nextRunAt &&
        isAgentStrategyDue(latest.config, new Date())))
  );
}

async function enqueueNewProactiveDispatch(
  context: ProactiveDispatchContext,
  strategy: AgentStrategySnapshot,
  remainingBudget: number,
  dispatchId: string,
  workflowHandoff: AgentWorkflowHandoffContext | undefined,
  ownership: ProactiveDispatchOwnership,
): Promise<string | null> {
  const { id: strategyId, organizationId, userId, config } = strategy;
  const performanceSnapshot =
    await context.performanceService.getPerformanceSnapshot(
      strategyId,
      organizationId,
      'weekly',
    );
  ownership.assertOwned();
  const objective = await context.buildSyntheticUserMessage(
    strategy,
    remainingBudget,
    performanceSnapshot,
  );
  ownership.assertOwned();
  const thread = await context.resolveStrategyThread(strategy, ownership);
  ownership.assertOwned();
  const dispatchThreadId = thread.id;
  if (!(await dispatchStillCurrent(context, strategy, ownership))) return null;
  await ownership.verifyOwned();
  const { executionId } = await context.workflowRunner.enqueueWorkflow(
    {
      actionType: 'agent.turn.execute',
      canonicalId: 'agent.turn.execute',
      idempotencyKey: dispatchId,
      inputValues: {
        request: {
          content: objective,
          source: 'proactive',
          creditBudget: remainingBudget,
          strategyId,
          threadId: dispatchThreadId,
          ...(config.agentType ? { agentType: config.agentType } : {}),
          autonomyMode: normalizeAgentAutonomyMode(config.autonomyMode),
          ...(strategy.brandId ? { brandId: strategy.brandId } : {}),
          ...(config.model ? { model: config.model } : {}),
        },
      },
      metadata: {
        ...(context.buildExecutionMetadata(strategy, workflowHandoff) ?? {}),
        label: `Proactive: ${strategy.label}`,
        performanceSnapshot,
        dispatchId,
        ...(strategy.brandId ? { brandId: strategy.brandId } : {}),
        source: 'proactive',
        strategyId,
        threadId: dispatchThreadId,
      },
      organizationId,
      source: PROACTIVE_AGENT_TURN_SOURCE,
      userId,
    },
    { dispatchClass: SystemWorkflowDispatchClass.BACKGROUND },
  );

  ownership.assertOwned();
  return executionId;
}

export async function executeDueProactiveStrategy(
  context: ProactiveDispatchContext,
  strategy: AgentStrategySnapshot,
  ownership: ProactiveDispatchOwnership,
  workflowHandoff?: AgentWorkflowHandoffContext,
): Promise<string | null> {
  const organizationId = strategy.organizationId;
  const strategyId = strategy.id;
  const current = await context.prisma.agentStrategy.findFirst({
    where: scopedWhere(organizationId, { id: strategyId, isActive: true }),
  });
  ownership.assertOwned();
  if (!current) return null;
  strategy = context.readStrategySnapshot(current);
  const config = strategy.config;
  const now = new Date();
  if (!isAgentStrategyDue({ ...config, nextRunAt: undefined }, now))
    return null;
  let recovery = await context.prisma.workflowExecution.findFirst({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    where: scopedWhere(
      organizationId,
      context.pendingDispatchWhere(organizationId, [strategyId]),
    ),
  });
  ownership.assertOwned();
  if (recovery?.status !== PrismaWorkflowExecutionStatus.PENDING)
    recovery = null;
  if (!recovery && !isAgentStrategyDue(strategy.config, now)) return null;
  const remainingBudget = recovery
    ? null
    : await context.resolveDispatchBudget(strategy, config, ownership);
  ownership.assertOwned();
  if (!recovery && remainingBudget === null) return null;
  const dueAt = context.parseDate(config.nextRunAt)?.toISOString() ?? 'initial';
  const currentDispatchId = `proactive:${createHash('sha256')
    .update(JSON.stringify([organizationId, strategyId, dueAt]))
    .digest('hex')}`;
  const dispatchId = recovery?.idempotencyKey ?? currentDispatchId;

  try {
    const existing =
      recovery ??
      (await context.prisma.workflowExecution.findFirst({
        where: scopedWhere(organizationId, { idempotencyKey: dispatchId }),
      }));
    ownership.assertOwned();
    if (existing && existing.status !== PrismaWorkflowExecutionStatus.PENDING) {
      ownership.assertOwned();
      if (dispatchId === currentDispatchId)
        await context.scheduleNextRun(
          strategyId,
          config.runFrequency,
          undefined,
          ownership,
        );
      return existing.id;
    }
    if (existing) {
      const result = context.readRecord(existing.result);
      if (!(await dispatchStillCurrent(context, strategy, ownership, true)))
        return null;
      await ownership.verifyOwned();
      await context.workflowRunner.enqueueWorkflow(
        {
          actionType: 'agent.turn.execute',
          canonicalId: 'agent.turn.execute',
          idempotencyKey: dispatchId,
          inputValues: context.readRecord(result.inputValues),
          metadata: context.readRecord(result.metadata),
          organizationId,
          source: PROACTIVE_AGENT_TURN_SOURCE,
          userId: existing.userId,
        },
        { dispatchClass: SystemWorkflowDispatchClass.BACKGROUND },
      );
      ownership.assertOwned();
      if (dispatchId === currentDispatchId)
        await context.scheduleNextRun(
          strategyId,
          config.runFrequency,
          undefined,
          ownership,
        );
      return existing.id;
    }
    if (remainingBudget === null) return null;
    const executionId = await enqueueNewProactiveDispatch(
      context,
      strategy,
      remainingBudget,
      dispatchId,
      workflowHandoff,
      ownership,
    );
    if (executionId === null) return null;

    if (dispatchId === currentDispatchId)
      await context.scheduleNextRun(
        strategyId,
        config.runFrequency,
        undefined,
        ownership,
      );
    return executionId;
  } catch (error) {
    if (error instanceof ProactiveDispatchOwnershipError) throw error;
    ownership.assertOwned();
    const durable = await context.prisma.workflowExecution.findFirst({
      where: scopedWhere(organizationId, { idempotencyKey: dispatchId }),
      select: { id: true },
    });
    ownership.assertOwned();
    if (durable) {
      ownership.assertOwned();
      if (dispatchId === currentDispatchId)
        await context.scheduleNextRun(
          strategyId,
          config.runFrequency,
          undefined,
          ownership,
        );
      return durable.id;
    }
    await context.recordStrategyFailure(
      strategy,
      config,
      error,
      dispatchId,
      ownership,
    );
    return null;
  }
}
