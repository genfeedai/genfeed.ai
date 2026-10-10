import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type {
  SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
  SystemWorkflowTerminalFailureHandler,
} from '@api/collections/workflows/system-workflow-runner.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';
import { ClipContinuityWorkflowService } from './clip-continuity-workflow.service';

function createHarness() {
  const actions = new Map<string, SystemWorkflowActionExecutor>();
  const terminalFailures = new Map<
    string,
    SystemWorkflowTerminalFailureHandler
  >();
  const prisma = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    batchItem: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    clipProject: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    task: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    workflowExecution: {
      findFirst: vi.fn().mockResolvedValue({
        nodeResults: [],
        result: {
          inputValues: {
            request: {
              runReferences: [
                {
                  assetId: 'asset-1',
                  role: 'character',
                  url: 'https://cdn.test/reference.png',
                },
              ],
            },
          },
        },
      }),
    },
  };
  const clipResults = {
    findByProject: vi.fn().mockResolvedValue([
      {
        id: 'clip-1',
        status: 'completed',
        videoUrl: 'https://cdn.test/clip.mp4',
      },
    ]),
  };
  const queue = { queueSystemWorkflow: vi.fn() };
  const moduleAccess = { canStartWork: vi.fn().mockResolvedValue(true) };
  const runner = {
    registerAction: vi.fn(
      (actionId: string, executor: SystemWorkflowActionExecutor) => {
        actions.set(actionId, executor);
      },
    ),
    terminalFailures: {
      register: vi.fn(
        (canonicalId: string, handler: SystemWorkflowTerminalFailureHandler) =>
          terminalFailures.set(canonicalId, handler),
      ),
    },
    registerWorkflow: vi.fn(),
  };
  const service = new ClipContinuityWorkflowService(
    { log: vi.fn() } as unknown as LoggerService,
    prisma as unknown as PrismaService,
    clipResults as unknown as ClipResultsService,
    queue as unknown as WorkflowExecutionQueueService,
    runner as unknown as SystemWorkflowRunnerService,
    moduleAccess as never,
  );
  service.onModuleInit();
  return {
    actions,
    clipResults,
    moduleAccess,
    prisma,
    queue,
    service,
    terminalFailures,
  };
}

const project = {
  continuityQaStatus: 'pending',
  id: 'project-1',
  organizationId: 'org-1',
  status: 'completed',
  userId: 'user-1',
  workflowExecutionId: 'generation-execution-1',
} as unknown as ClipProjectDocument;

describe('ClipContinuityWorkflowService', () => {
  it('fails only the in-flight QA of the generation run that queued it (#6655)', async () => {
    const { prisma, terminalFailures } = createHarness();

    await terminalFailures.get('clip.continuity')?.({
      inputValues: {
        generationWorkflowExecutionId: 'generation-execution-1',
        projectId: 'project-1',
      },
      organizationId: 'org-1',
      workflowError: 'Action contract input validation failed',
    });

    expect(prisma.clipProject.updateMany).toHaveBeenCalledWith({
      data: { continuityQaStatus: 'failed' },
      where: expect.objectContaining({
        continuityQaStatus: { in: ['queued', 'running'] },
        id: 'project-1',
        isDeleted: false,
        organizationId: 'org-1',
        workflowExecutionId: 'generation-execution-1',
      }),
    });
  });

  it.each([
    'clip.continuity.begin',
    'clip.continuity.fail',
    'clip.continuity.persist-report',
  ])(
    'rejects a forged actor before continuity effects for %s',
    async (actionId) => {
      const { actions, prisma } = createHarness();
      const executor = actions.get(actionId);
      expect(executor).toBeDefined();
      await expect(
        executor?.({
          context: { organizationId: 'org-1', userId: 'user-1' },
          input: { projectId: 'project-1', userId: 'foreign-user' },
        } as never),
      ).rejects.toThrow('does not match');
      expect(prisma.clipProject.updateMany).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    },
  );

  it('keeps optional QA pending and saved reads available when Clips access cannot start work', async () => {
    const { moduleAccess, prisma, clipResults, queue, service } =
      createHarness();
    moduleAccess.canStartWork.mockResolvedValue(false);
    await expect(service.queueIfReady(project)).resolves.toBe(false);
    expect(moduleAccess.canStartWork).toHaveBeenCalledWith('org-1', 'clips');
    expect(prisma.workflowExecution.findFirst).not.toHaveBeenCalled();
    expect(clipResults.findByProject).not.toHaveBeenCalled();
    expect(prisma.clipProject.updateMany).not.toHaveBeenCalled();
    expect(queue.queueSystemWorkflow).not.toHaveBeenCalled();
  });
  it('restores a pending claim when access changes during preparation without queuing QA', async () => {
    const { moduleAccess, prisma, queue, service } = createHarness();
    moduleAccess.canStartWork
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(service.queueIfReady(project)).resolves.toBe(false);
    expect(moduleAccess.canStartWork).toHaveBeenCalledTimes(2);
    expect(prisma.clipProject.updateMany).toHaveBeenLastCalledWith({
      data: { continuityQaStatus: 'pending' },
      where: {
        organizationId: 'org-1',
        isDeleted: false,
        continuityQaStatus: 'queued',
        id: 'project-1',
      },
    });
    expect(queue.queueSystemWorkflow).not.toHaveBeenCalled();
  });
  it('restores a claimed status and propagates an unexpected queue failure', async () => {
    const { prisma, queue, service } = createHarness();
    queue.queueSystemWorkflow.mockRejectedValueOnce(
      new Error('Queue unavailable'),
    );
    await expect(service.queueIfReady(project)).rejects.toThrow(
      'Queue unavailable',
    );
    expect(prisma.clipProject.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { continuityQaStatus: 'pending' } }),
    );
  });

  it('atomically claims and queues one action-backed continuity graph', async () => {
    const { prisma, queue, service } = createHarness();

    await expect(service.queueIfReady(project)).resolves.toBe(true);
    expect(prisma.clipProject.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { continuityQaStatus: 'queued' } }),
    );
    expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'clip.continuity',
        inputValues: expect.objectContaining({
          clipDescriptors: [
            expect.objectContaining({ id: 'clip-1', qaIndex: 0 }),
          ],
          items: ['https://cdn.test/clip.mp4'],
        }),
      }),
      'clip-continuity-project-1-generation-execution-1',
      {
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
        failureWorkflow: {
          canonicalId: 'clip.continuity.failure',
          inputValues: { projectId: 'project-1' },
        },
      },
    );
  });

  it('does not queue a second graph after the durable claim is lost', async () => {
    const { prisma, queue, service } = createHarness();
    prisma.clipProject.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.queueIfReady(project)).resolves.toBe(false);
    expect(queue.queueSystemWorkflow).not.toHaveBeenCalled();
  });

  it('persists the aggregate report only inside its final action node', async () => {
    const { actions, prisma } = createHarness();
    const persist = actions.get('clip.continuity.persist-report');
    if (!persist) {
      throw new Error('Continuity persistence action was not registered');
    }
    const dimension = {
      confidence: 0.9,
      summary: 'Consistent.',
      verdict: 'consistent',
    } as const;

    await expect(
      persist({
        context: { organizationId: 'org-1', userId: 'user-1' } as never,
        input: {
          clipDescriptors: [
            {
              id: 'clip-1',
              qaIndex: 0,
              status: 'completed',
              videoUrl: 'https://cdn.test/clip.mp4',
            },
          ],
          generationWorkflowExecutionId: 'generation-execution-1',
          projectId: 'project-1',
          qaBatch: {
            count: 1,
            results: [
              {
                index: 0,
                result: {
                  clips: [
                    {
                      character: dimension,
                      clipId: 'workflow-video',
                      clipIndex: 0,
                      errors: [],
                      evidenceFrames: [],
                      outfit: dimension,
                      product: dimension,
                    },
                  ],
                  completedAt: '2026-08-28T00:00:00.000Z',
                  projectId: 'workflow-1',
                  referenceAssetIds: { character: [], product: [] },
                  runId: 'run-1',
                  schemaVersion: 1,
                  status: 'completed',
                  summary: {
                    assessedClipCount: 1,
                    driftClipCount: 0,
                    errorClipCount: 0,
                    totalClipCount: 1,
                  },
                },
              },
            ],
          },
          referenceAssetIds: { character: ['asset-1'], product: [] },
        },
        provenance: {
          executionId: 'continuity-execution-1',
          workflowId: 'continuity-workflow-1',
          workflowLabel: 'Clip Continuity QA',
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        projectId: 'project-1',
        runId: 'continuity-execution-1',
        status: 'completed',
      }),
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(String(prisma.$executeRaw.mock.calls[0]?.[0])).toContain(
      'continuityQaStatus',
    );
  });
});
