vi.unmock('@genfeedai/prisma');

import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { createVersionedWorkflow } from '@api/collections/workflows/workflow-version-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';
import { WorkflowExecutionStatus } from '@genfeedai/prisma';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  assertTenantScopedQuery,
  TenantIsolationError,
} from '@libs/prisma/tenant-guard';

/**
 * The workflow engine runs inside the request's tenant context (#5981), so in
 * CLOUD mode every Prisma query on a tenant model it issues is checked by the
 * real `assertTenantScopedQuery`. These specs run the engine paths that every
 * MCP/agent tool reaches against a fake client that applies that guard exactly
 * like the Prisma `$allOperations` extension.
 */

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const TENANT_MODELS: ReadonlySet<string> = new Set([
  'Workflow',
  'WorkflowExecution',
]);

type Handler = (args: unknown) => unknown;
type Handlers = Record<string, Handler>;

function toModelName(delegate: string): string {
  return delegate.charAt(0).toUpperCase() + delegate.slice(1);
}

/** Fake Prisma client: every model operation runs the real CLOUD guard. */
function createGuardedPrisma(handlers: Handlers) {
  const calls: Array<{ args: unknown; key: string }> = [];
  const client: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, property: string) {
        if (property === '$transaction') {
          return async (callback: (tx: unknown) => unknown) => callback(client);
        }
        if (property === '$executeRaw' || property === '$queryRaw') {
          return async () => 0;
        }
        const model = toModelName(property);
        return new Proxy(
          {},
          {
            get(_delegate, operation: string) {
              return async (args: unknown) => {
                assertTenantScopedQuery({
                  args,
                  isCloud: true,
                  model,
                  operation,
                  tenantModelNames: TENANT_MODELS,
                });
                const key = `${model}.${operation}`;
                calls.push({ args, key });
                const handler = handlers[key];
                if (!handler) {
                  throw new Error(`unexpected query ${key}`);
                }
                return handler(args);
              };
            },
          },
        );
      },
    },
  );

  return { calls, client };
}

const logger = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

function createExecutionsService(handlers: Handlers) {
  const { calls, client } = createGuardedPrisma(handlers);
  const service = new WorkflowExecutionsService(
    client as never,
    logger as never,
    { emitExecutionOutcome: vi.fn().mockResolvedValue(undefined) } as never,
    {
      afterCommit: vi.fn().mockResolvedValue(undefined),
      recordInTransaction: vi
        .fn()
        .mockResolvedValue({ activity: { id: 'activity-1' }, commit: null }),
    } as never,
    { recordRun: vi.fn() } as never,
  );
  return { calls, service };
}

const executionRow = {
  id: 'execution-1',
  organizationId: ORG,
  progress: 0,
  startedAt: new Date('2026-10-04T00:00:00.000Z'),
  status: WorkflowExecutionStatus.RUNNING,
  trigger: 'manual',
  userId: 'user-1',
  workflow: { label: 'Workflow', metadata: null, userId: 'user-1' },
  workflowId: 'workflow-1',
};

describe('workflow engine in CLOUD tenant context', () => {
  describe('WorkflowExecutionsService lifecycle', () => {
    const handlers: Handlers = {
      'WorkflowExecution.findFirst': () => executionRow,
      'WorkflowExecution.update': () => executionRow,
      'WorkflowExecution.updateMany': () => ({ count: 1 }),
    };

    it('runs start, progress, failed-node, credits and runtime state under the request tenant', async () => {
      const { service } = createExecutionsService(handlers);

      await runWithTenantContext({ organizationId: ORG }, async () => {
        await expect(
          service.startExecution('execution-1', ORG),
        ).resolves.toBeDefined();
        await expect(
          service.updateExecutionProgress('execution-1', ORG, { progress: 10 }),
        ).resolves.toMatchObject({ id: 'execution-1' });
        await expect(
          service.setFailedNodeId('execution-1', ORG, 'node-1'),
        ).resolves.toBeUndefined();
        await expect(
          service.setCreditsUsed('execution-1', ORG, 3),
        ).resolves.toBeUndefined();
        await expect(
          service.getRuntimeState('execution-1', ORG),
        ).resolves.toMatchObject({ progress: 0 });
      });
    });

    it('completes and cancels an execution under the request tenant', async () => {
      const { service } = createExecutionsService({
        ...handlers,
        'AgentStrategy.findFirst': () => null,
      });

      await runWithTenantContext({ organizationId: ORG }, async () => {
        await expect(
          service.completeExecution('execution-1', ORG),
        ).resolves.toMatchObject({ id: 'execution-1' });
        await expect(
          service.cancelExecution('execution-1', ORG),
        ).resolves.toBeDefined();
      });
    });

    it('scopes every execution read and write by the passed organization', async () => {
      const { calls, service } = createExecutionsService(handlers);

      await runWithTenantContext({ organizationId: ORG }, async () => {
        await service.startExecution('execution-1', ORG);
        await service.setCreditsUsed('execution-1', ORG, 3);
        await service.getRuntimeState('execution-1', ORG);
      });

      expect(calls.map((call) => call.args)).toEqual([
        expect.objectContaining({
          where: { id: 'execution-1', isDeleted: false, organizationId: ORG },
        }),
        expect.objectContaining({
          where: { id: 'execution-1', isDeleted: false, organizationId: ORG },
        }),
        expect.objectContaining({
          where: { id: 'execution-1', isDeleted: false, organizationId: ORG },
        }),
      ]);
    });

    it('refuses to touch another tenant execution', async () => {
      const { service } = createExecutionsService(handlers);

      await runWithTenantContext({ organizationId: ORG }, async () => {
        await expect(
          service.startExecution('execution-1', OTHER_ORG),
        ).rejects.toBeInstanceOf(TenantIsolationError);
        await expect(
          service.cancelExecution('execution-1', OTHER_ORG),
        ).rejects.toBeInstanceOf(TenantIsolationError);
      });
    });
  });

  describe('WorkflowSchedulerService.updateSchedule', () => {
    it('reads and writes the workflow under the request tenant', async () => {
      const { calls, client } = createGuardedPrisma({
        'Workflow.findFirst': () => ({ id: 'workflow-1' }),
        'Workflow.update': () => ({
          currentVersion: {
            graph: { edges: [], lockedNodeIds: [], nodes: [] },
            id: 'version-1',
            inputSchema: [],
            version: 1,
          },
          id: 'workflow-1',
          organizationId: ORG,
        }),
      });
      const service = new (
        WorkflowSchedulerService as unknown as new (
          ...args: unknown[]
        ) => WorkflowSchedulerService
      )(
        client,
        logger,
        { isDevSchedulersEnabled: false },
        {},
        {
          removeWorkflowScheduler: vi.fn().mockResolvedValue(undefined),
          upsertWorkflowScheduler: vi.fn().mockResolvedValue(undefined),
        },
      );

      await runWithTenantContext({ organizationId: ORG }, async () => {
        await expect(
          service.updateSchedule('workflow-1', ORG, '0 9 * * *', 'UTC', true),
        ).resolves.not.toBeNull();
        await expect(
          service.updateSchedule('workflow-1', OTHER_ORG, '0 9 * * *'),
        ).rejects.toBeInstanceOf(TenantIsolationError);
      });

      expect(calls.map((call) => call.key)).toEqual([
        'Workflow.findFirst',
        'Workflow.update',
      ]);
    });
  });

  describe('createVersionedWorkflow', () => {
    it('re-reads the created workflow scoped to its organization', async () => {
      const { calls, client } = createGuardedPrisma({
        'Workflow.create': (args) => ({
          id: 'workflow-1',
          ...(args as { data: Record<string, unknown> }).data,
        }),
        'Workflow.findFirstOrThrow': () => ({
          currentVersion: { id: 'version-1' },
          id: 'workflow-1',
        }),
        'WorkflowVersion.create': () => ({ id: 'version-1' }),
      });

      await runWithTenantContext({ organizationId: ORG }, async () => {
        await createVersionedWorkflow(
          client as never,
          { organizationId: ORG, userId: 'user-1' },
          {},
        );
      });

      expect(
        calls.find((call) => call.key === 'Workflow.findFirstOrThrow')?.args,
      ).toEqual({
        include: { currentVersion: true },
        where: { id: 'workflow-1', isDeleted: false, organizationId: ORG },
      });
    });
  });

  describe('SystemWorkflowRunnerService hidden mirror', () => {
    const definition: SystemWorkflowGraphDefinition = {
      canonicalId: 'clip-hook-review',
      definition: {
        edges: [],
        nodes: [
          createGenfeedActionNode({
            actionId: 'youtube.resolve-source',
            id: 'review-hook',
          }),
        ],
      },
      description: 'Review one generated hook clip.',
      label: 'Clip Hook Review',
      resultNodeId: 'review-hook',
    };

    type RunnerInternals = {
      assertHiddenSystemWorkflowParent: (request: unknown) => Promise<void>;
      ensureHiddenSystemWorkflowMirror: (
        input: SystemWorkflowGraphDefinition,
      ) => Promise<{ id: string }>;
    };

    it('creates the platform-global mirror from a tenant request without a guard throw', async () => {
      const { calls, client } = createGuardedPrisma({
        'Workflow.create': (args) => ({
          id: 'mirror-1',
          ...(args as { data: Record<string, unknown> }).data,
        }),
        'Workflow.findFirst': () => null,
        'Workflow.findFirstOrThrow': () => ({
          currentVersion: { id: 'version-1' },
          id: 'mirror-1',
        }),
        'WorkflowVersion.create': () => ({ id: 'version-1' }),
      });
      const runner = new SystemWorkflowRunnerService(
        client as never,
        {} as never,
      ) as unknown as RunnerInternals;

      await runWithTenantContext({ organizationId: ORG }, async () => {
        await expect(
          runner.ensureHiddenSystemWorkflowMirror(definition),
        ).resolves.toMatchObject({ id: 'mirror-1' });
      });

      expect(calls.map((call) => call.key)).toContain('Workflow.findFirst');
      expect(
        calls.find((call) => call.key === 'Workflow.findFirst')?.args,
      ).toMatchObject({
        where: { organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID },
      });
    });

    it('would be rejected by the guard without the cross-org escape hatch', async () => {
      const { client } = createGuardedPrisma({
        'Workflow.findFirst': () => null,
      });

      await runWithTenantContext({ organizationId: ORG }, async () => {
        await expect(
          (
            client as unknown as {
              workflow: { findFirst: (args: unknown) => Promise<unknown> };
            }
          ).workflow.findFirst({
            where: {
              isDeleted: false,
              organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
            },
          }),
        ).rejects.toBeInstanceOf(TenantIsolationError);
      });
    });

    it('reads the hidden parent workflow from a tenant request without a guard throw', async () => {
      const { client } = createGuardedPrisma({
        'Workflow.findFirst': () => ({
          metadata: {
            sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
            systemWorkflow: buildHiddenSystemWorkflowMetadata({
              canonicalId: 'clip-hook-review',
            }),
          },
        }),
      });
      const runner = new SystemWorkflowRunnerService(
        client as never,
        {} as never,
      ) as unknown as RunnerInternals;

      await runWithTenantContext({ organizationId: ORG }, async () => {
        await expect(
          runner.assertHiddenSystemWorkflowParent({
            provenance: { workflowId: 'mirror-1' },
          }),
        ).resolves.toBeUndefined();
      });
    });
  });
});
