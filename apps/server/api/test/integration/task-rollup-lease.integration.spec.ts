/**
 * Real-Postgres proof of the workspace-task rollup lease (#6265).
 *
 * The lease claim and the conditional final/progress writes are single
 * predicate-guarded statements, so concurrent callers in the API and workers
 * must observe exactly one winner, an expired lease must be re-claimable, and
 * a stale or displaced writer must change nothing.
 */

type SkippableSuiteFn = (name: string, fn: () => void | Promise<void>) => void;
type SkippableSuite = SkippableSuiteFn & { skip?: SkippableSuiteFn };
interface GlobalWithTestOverrides {
  describe: SkippableSuiteFn;
  it: SkippableSuiteFn;
  test: SkippableSuiteFn;
}

if (process.env.SKIP_PRISMA_DB === 'true') {
  const g = global as unknown as GlobalWithTestOverrides;
  const originalDescribe = describe as unknown as SkippableSuite;
  const originalIt = it as unknown as SkippableSuite;
  g.describe = (name, fn) =>
    originalDescribe.skip
      ? originalDescribe.skip(name, fn)
      : describe(name, fn);
  g.it = (name, fn) =>
    originalIt.skip ? originalIt.skip(name, fn) : it(name, fn);
  g.test = g.it;
}

import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { createVersionedWorkflow } from '@api/collections/workflows/workflow-version-definition';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  createTestOrganization,
  generateIdString,
} from '@api-test/e2e/e2e-test.utils';
import { E2ETestModule } from '@api-test/e2e-test.module';
import { WorkflowExecutionStatus } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

const LEASE_TTL_MS = 60_000;

describe('Workspace task rollup lease (real Postgres, #6265)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: TasksService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [await E2ETestModule.forRoot()],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = new TasksService(
      prisma,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function seedTask(
    executionStatuses: WorkflowExecutionStatus[],
    overrides: { status?: string; updatedAt?: Date } = {},
  ): Promise<{ organizationId: string; taskId: string }> {
    const userId = generateIdString();
    const organizationId = generateIdString();
    const taskId = generateIdString();
    await prisma.user.create({
      data: { email: `${userId}@example.com`, handle: userId, id: userId },
    });
    await prisma.organization.create({
      data: createTestOrganization({ id: organizationId, userId }),
    });
    const executionIds = await prisma.$transaction(async (transaction) => {
      const workflow = await createVersionedWorkflow(
        transaction,
        {
          isDeleted: false,
          label: 'Rollup lease fixture',
          organizationId,
          userId,
        },
        {},
      );
      const ids: string[] = [];
      for (const status of executionStatuses) {
        const execution = await transaction.workflowExecution.create({
          data: {
            organizationId,
            status,
            userId,
            workflowId: workflow.id,
            workflowVersionId: workflow.currentVersionId,
          },
        });
        ids.push(execution.id);
      }
      return ids;
    });
    await prisma.task.create({
      data: {
        config: { request: 'a green apple' },
        id: taskId,
        linkedExecutions: { connect: executionIds.map((id) => ({ id })) },
        organizationId,
        status: overrides.status ?? 'in_progress',
        title: 'Rollup lease fixture',
      },
    });
    if (overrides.updatedAt) {
      await prisma.$executeRaw`UPDATE tasks SET "updatedAt" = ${overrides.updatedAt} WHERE id = ${taskId}`;
    }
    return { organizationId, taskId };
  }

  it('grants the lease to exactly one of many concurrent claimants', async () => {
    const { organizationId, taskId } = await seedTask([
      WorkflowExecutionStatus.COMPLETED,
    ]);

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        service.acquireRollupLease(
          taskId,
          organizationId,
          `owner-${index}`,
          LEASE_TTL_MS,
        ),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('refuses a live lease and re-grants an expired one', async () => {
    const { organizationId, taskId } = await seedTask([
      WorkflowExecutionStatus.COMPLETED,
    ]);
    const start = new Date();

    expect(
      await service.acquireRollupLease(
        taskId,
        organizationId,
        'owner-a',
        LEASE_TTL_MS,
        start,
      ),
    ).toBe(true);
    expect(
      await service.acquireRollupLease(
        taskId,
        organizationId,
        'owner-b',
        LEASE_TTL_MS,
        new Date(start.getTime() + LEASE_TTL_MS - 1),
      ),
    ).toBe(false);
    expect(
      await service.acquireRollupLease(
        taskId,
        organizationId,
        'owner-b',
        LEASE_TTL_MS,
        new Date(start.getTime() + LEASE_TTL_MS),
      ),
    ).toBe(true);

    const row = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(row.rollupLeaseOwner).toBe('owner-b');
  });

  it('lets only the current holder write the final status with its fields', async () => {
    const { organizationId, taskId } = await seedTask([
      WorkflowExecutionStatus.COMPLETED,
    ]);
    const start = new Date();
    await service.acquireRollupLease(
      taskId,
      organizationId,
      'owner-a',
      LEASE_TTL_MS,
      start,
    );
    await service.acquireRollupLease(
      taskId,
      organizationId,
      'owner-b',
      LEASE_TTL_MS,
      new Date(start.getTime() + LEASE_TTL_MS),
    );
    const finalPatch = {
      config: { qualityAssessment: { gate: 'pass' } },
      reviewState: 'pending_approval',
      rolledUpAt: new Date(),
      rollupLeaseExpiresAt: null,
      rollupLeaseOwner: null,
      status: 'in_review' as const,
    };

    // The displaced holder A wakes up late: nothing changes.
    expect(
      await service.patchIfMatches(
        taskId,
        organizationId,
        { rollupLeaseOwner: 'owner-a', status: 'in_progress' },
        finalPatch,
      ),
    ).toBeNull();
    let row = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(row.status).toBe('in_progress');
    expect(row.rollupLeaseOwner).toBe('owner-b');

    const written = await service.patchIfMatches(
      taskId,
      organizationId,
      { rollupLeaseOwner: 'owner-b', status: 'in_progress' },
      finalPatch,
    );
    expect(written?.status).toBe('in_review');
    row = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(row).toEqual(
      expect.objectContaining({
        reviewState: 'pending_approval',
        rollupLeaseExpiresAt: null,
        rollupLeaseOwner: null,
        status: 'in_review',
      }),
    );
    expect(row.config).toEqual({
      qualityAssessment: { gate: 'pass' },
      request: 'a green apple',
    });
  });

  it('drops a progress write that lands after the task was rolled up', async () => {
    const { organizationId, taskId } = await seedTask([
      WorkflowExecutionStatus.COMPLETED,
    ]);
    await service.acquireRollupLease(
      taskId,
      organizationId,
      'owner-a',
      LEASE_TTL_MS,
    );
    await service.patchIfMatches(
      taskId,
      organizationId,
      { rollupLeaseOwner: 'owner-a', status: 'in_progress' },
      {
        progress: { stage: 'review' },
        rollupLeaseOwner: null,
        status: 'in_review',
      },
    );

    expect(
      await service.patchIfMatches(
        taskId,
        organizationId,
        { status: 'in_progress' },
        { progress: { stage: 'running' } },
      ),
    ).toBeNull();
    const row = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(row.progress).toEqual({ stage: 'review' });
  });

  it('finds only settled, unleased, idle in-progress tasks for recovery', async () => {
    const now = new Date();
    const idle = new Date(now.getTime() - 10 * 60_000);
    const stalled = await seedTask(
      [WorkflowExecutionStatus.COMPLETED, WorkflowExecutionStatus.FAILED],
      { updatedAt: idle },
    );
    const running = await seedTask(
      [WorkflowExecutionStatus.COMPLETED, WorkflowExecutionStatus.RUNNING],
      { updatedAt: idle },
    );
    const leased = await seedTask([WorkflowExecutionStatus.COMPLETED], {
      updatedAt: idle,
    });
    await service.acquireRollupLease(
      leased.taskId,
      leased.organizationId,
      'owner-a',
      LEASE_TTL_MS,
      now,
    );
    await prisma.$executeRaw`UPDATE tasks SET "updatedAt" = ${idle} WHERE id = ${leased.taskId}`;
    const recent = await seedTask([WorkflowExecutionStatus.COMPLETED]);
    const reviewed = await seedTask([WorkflowExecutionStatus.COMPLETED], {
      status: 'in_review',
      updatedAt: idle,
    });

    const candidates = await service.findStalledRollupCandidates({
      createdAfter: new Date(now.getTime() - 24 * 60 * 60_000),
      limit: 1000,
      now,
      settledBefore: new Date(now.getTime() - 2 * 60_000),
    });
    const ids = candidates.map((candidate) => candidate.id);

    expect(ids).toContain(stalled.taskId);
    expect(ids).not.toContain(running.taskId);
    expect(ids).not.toContain(leased.taskId);
    expect(ids).not.toContain(recent.taskId);
    expect(ids).not.toContain(reviewed.taskId);
  });

  it('does not re-roll a reopened task until new executions are linked', async () => {
    const { organizationId, taskId } = await seedTask([
      WorkflowExecutionStatus.COMPLETED,
    ]);
    const candidateIds = (now: Date) =>
      service
        .findStalledRollupCandidates({
          createdAfter: new Date(now.getTime() - 24 * 60 * 60_000),
          limit: 1000,
          now,
          // Ignore the idle grace: this test is about the rollup cycle only.
          settledBefore: new Date(now.getTime() + 60_000),
        })
        .then((candidates) => candidates.map((candidate) => candidate.id));
    await service.acquireRollupLease(
      taskId,
      organizationId,
      'owner-a',
      LEASE_TTL_MS,
    );
    await service.patchIfMatches(
      taskId,
      organizationId,
      { rollupLeaseOwner: 'owner-a', status: 'in_progress' },
      {
        rolledUpAt: new Date(),
        rollupLeaseExpiresAt: null,
        rollupLeaseOwner: null,
        status: 'in_review',
      },
    );

    // PATCH status back to in_progress, as the tasks controller allows.
    await service.patch(taskId, { status: 'in_progress' });
    expect(await candidateIds(new Date())).not.toContain(taskId);
    expect(
      await service.acquireRollupLease(
        taskId,
        organizationId,
        'owner-b',
        LEASE_TTL_MS,
      ),
    ).toBe(false);

    // Linking a new cycle of executions makes it eligible again.
    const task = await prisma.task.findUniqueOrThrow({
      include: { linkedExecutions: { select: { id: true } } },
      where: { id: taskId },
    });
    await service.patch(taskId, {
      linkedExecutionIds: task.linkedExecutions.map(({ id }) => id),
    });
    expect(await candidateIds(new Date())).toContain(taskId);
  });
});
