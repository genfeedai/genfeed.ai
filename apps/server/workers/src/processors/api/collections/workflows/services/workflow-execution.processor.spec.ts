import type { WorkflowExecutionJobData } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { getActionOriginContext } from '@api/index';
import { ActionOrigin, WorkflowExecutionStatus } from '@genfeedai/contracts';
import {
  PLATFORM_SYSTEM_WORKFLOW_QUEUE,
  WORKFLOW_BACKGROUND_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
} from '@genfeedai/contracts/queue';
import { WorkflowExecutionProcessor } from '@workers/processors/api/collections/workflows/services/workflow-execution.processor';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function createMockExecutorService() {
  return {
    continueExistingExecution: vi.fn().mockResolvedValue({
      executionId: 'exec-1',
      nodeResults: [],
      startedAt: new Date(),
      status: WorkflowExecutionStatus.COMPLETED,
      totalCreditsUsed: 0,
      workflowId: 'wf-1',
    }),
    handleTriggerEvent: vi.fn().mockResolvedValue([
      {
        executionId: 'exec-1',
        nodeResults: [],
        startedAt: new Date(),
        status: WorkflowExecutionStatus.COMPLETED,
        totalCreditsUsed: 0,
        workflowId: 'wf-1',
      },
    ]),
    resumeAfterDelay: vi.fn().mockResolvedValue({
      executionId: 'exec-1',
      nodeResults: [],
      startedAt: new Date(),
      status: WorkflowExecutionStatus.COMPLETED,
      totalCreditsUsed: 0,
      workflowId: 'wf-1',
    }),
  };
}

function createMockQueueService() {
  return {
    queueDelayedResume: vi.fn().mockResolvedValue('job-123'),
    queueTriggerEvent: vi.fn().mockResolvedValue('job-456'),
    runWithQueuedOrganizationModule: vi.fn(
      async (_data: WorkflowExecutionJobData, work: () => Promise<unknown>) =>
        work(),
    ),
  };
}

function createMockSchedulerService() {
  return {
    executeScheduledWorkflow: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockSystemWorkflowRunner() {
  return {
    getRegisteredFailureWorkflow: vi.fn().mockReturnValue(undefined),
    terminalFailures: { settle: vi.fn().mockResolvedValue(false) },
    runWithStoredWorkflowModule: vi.fn(
      async (_input: unknown, work: () => Promise<unknown>) => work(),
    ),
    runWithRegisteredWorkflowModule: vi.fn(
      async (_input: unknown, work: () => Promise<unknown>) => work(),
    ),
    runWorkflow: vi.fn().mockResolvedValue({
      provenance: {
        executionId: 'exec-failure',
        workflowId: 'wf-failure',
        workflowLabel: 'Failure workflow',
      },
      result: { status: 'failed' },
    }),
    startWorkflow: vi.fn().mockResolvedValue({
      execution: {
        executionId: 'exec-system',
        nodeResults: [],
        startedAt: new Date(),
        status: WorkflowExecutionStatus.COMPLETED,
        totalCreditsUsed: 0,
        workflowId: 'wf-system',
      },
      provenance: {
        executionId: 'exec-system',
        workflowId: 'wf-system',
        workflowLabel: 'System workflow',
      },
      userId: 'user-1',
    }),
  };
}

function createMockJob(
  data: WorkflowExecutionJobData,
  overrides: Record<string, unknown> = {},
) {
  return {
    attemptsMade: 0,
    data,
    id: 'job-1',
    name: data.type,
    queueName: WORKFLOW_EXECUTION_QUEUE,
    opts: { attempts: 1 },
    updateData: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('WorkflowExecutionProcessor', () => {
  let processor: WorkflowExecutionProcessor;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockExecutor: ReturnType<typeof createMockExecutorService>;
  let mockQueue: ReturnType<typeof createMockQueueService>;
  let mockScheduler: ReturnType<typeof createMockSchedulerService>;
  let mockSystemWorkflowRunner: ReturnType<
    typeof createMockSystemWorkflowRunner
  >;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockExecutor = createMockExecutorService();
    mockQueue = createMockQueueService();
    mockScheduler = createMockSchedulerService();
    mockSystemWorkflowRunner = createMockSystemWorkflowRunner();

    processor = new (
      WorkflowExecutionProcessor as unknown as new (
        ...args: unknown[]
      ) => WorkflowExecutionProcessor
    )(
      mockLogger,
      mockExecutor,
      mockQueue,
      mockScheduler,
      mockSystemWorkflowRunner,
    );
  });

  describe('module revocation', () => {
    it('blocks an old delay with no module envelope before resume or another queue write', async () => {
      mockSystemWorkflowRunner.runWithStoredWorkflowModule.mockRejectedValueOnce(
        new Error('Automation disabled'),
      );
      const delayResumeData = {
        executionId: 'old-execution',
        workflowId: 'old-workflow',
        organizationId: 'org-1',
        userId: 'user-1',
        delayNodeId: 'delay-1',
        remainingNodeIds: ['publish'],
        nodeOutputCache: {},
        triggerEvent: {
          type: 'manual',
          platform: 'manual',
          organizationId: 'org-1',
          userId: 'user-1',
          data: {},
        },
      };
      await expect(
        processor.process(
          createMockJob({ type: 'delay-resume', delayResumeData }) as never,
        ),
      ).rejects.toThrow('Automation disabled');
      expect(
        mockSystemWorkflowRunner.runWithStoredWorkflowModule,
      ).toHaveBeenCalledWith(delayResumeData, expect.any(Function));
      expect(mockExecutor.resumeAfterDelay).not.toHaveBeenCalled();
      expect(mockQueue.queueDelayedResume).not.toHaveBeenCalled();
    });

    it('checks static module ownership on a legacy job before resuming its existing execution', async () => {
      mockSystemWorkflowRunner.runWithRegisteredWorkflowModule.mockRejectedValueOnce(
        new Error('Messages disabled'),
      );
      const job = createMockJob({
        type: 'system-run',
        systemRun: {
          input: {
            actionType: 'social.inbox.outbound.send-dm',
            canonicalId: 'social.inbox.outbound.send-dm',
            organizationId: 'org-1',
            source: 'legacy',
          },
          priorExecution: {
            executionId: 'old-execution',
            status: WorkflowExecutionStatus.RUNNING,
            userId: 'user-1',
            workflowId: 'old-workflow',
            workflowLabel: 'Send DM',
          },
          failureWorkflow: { canonicalId: 'failed-message' },
        },
      });
      await expect(processor.process(job as never)).rejects.toThrow(
        'Messages disabled',
      );
      expect(
        mockSystemWorkflowRunner.runWithRegisteredWorkflowModule,
      ).toHaveBeenCalledWith(job.data.systemRun?.input, expect.any(Function));
      expect(mockExecutor.continueExistingExecution).not.toHaveBeenCalled();
      expect(mockSystemWorkflowRunner.startWorkflow).not.toHaveBeenCalled();
      expect(job.updateData).not.toHaveBeenCalled();
      expect(mockSystemWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalId: 'failed-message',
          organizationId: 'org-1',
        }),
      );
    });

    it('blocks execution and runs registered failure compensation after revocation', async () => {
      mockQueue.runWithQueuedOrganizationModule.mockRejectedValueOnce(
        new Error('Module disabled'),
      );
      const job = createMockJob({
        type: 'system-run',
        organizationModuleContext: {
          organizationId: 'org-1',
          moduleId: 'clips',
        },
        systemRun: {
          input: {
            actionType: 'clip-generate',
            canonicalId: 'clip-generate',
            organizationId: 'org-1',
            source: 'web',
          },
          failureWorkflow: { canonicalId: 'clip-failed' },
        },
      });
      await expect(processor.process(job as never)).rejects.toThrow(
        'Module disabled',
      );
      expect(mockSystemWorkflowRunner.startWorkflow).not.toHaveBeenCalled();
      expect(mockSystemWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalId: 'clip-failed',
          organizationId: 'org-1',
        }),
      );
    });

    it.each(['missing', 'altered'] as const)(
      'uses registered Motion compensation for a legacy %s failure payload',
      async (kind) => {
        mockQueue.runWithQueuedOrganizationModule.mockRejectedValueOnce(
          new Error('Motion disabled'),
        );
        const input = {
          actionType: 'visual-code.execute',
          canonicalId: 'visual-code.execute',
          organizationId: 'org-1',
          userId: 'user-1',
          source: 'visual-code',
          inputValues: {
            job: {
              revisionId: 'revision-1',
              organizationId: 'org-1',
              brandId: 'brand-1',
              userId: 'user-1',
            },
          },
        };
        mockSystemWorkflowRunner.getRegisteredFailureWorkflow.mockReturnValue({
          canonicalId: 'visual-code.failure',
          inputValues: input.inputValues,
        });
        const job = createMockJob(
          {
            type: 'system-run',
            systemRun: {
              input,
              ...(kind === 'altered'
                ? {
                    failureWorkflow: {
                      canonicalId: 'attacker',
                      inputValues: { job: 'foreign' },
                    },
                  }
                : {}),
              priorExecution: {
                executionId: 'motion-execution',
                status: WorkflowExecutionStatus.PENDING,
                userId: 'user-1',
                workflowId: 'motion-workflow',
                workflowLabel: 'Motion',
              },
            },
          },
          { id: 'system-workflow-motion-execution' },
        );
        await expect(processor.process(job as never)).rejects.toThrow(
          'Motion disabled',
        );
        expect(
          mockSystemWorkflowRunner.getRegisteredFailureWorkflow,
        ).toHaveBeenCalledWith(input);
        expect(mockSystemWorkflowRunner.runWorkflow).toHaveBeenCalledWith({
          canonicalId: 'visual-code.failure',
          actionType: 'visual-code.failure',
          inputValues: {
            ...input.inputValues,
            workflowError: 'Motion disabled',
          },
          metadata: {
            failedCanonicalId: 'visual-code.execute',
            failedJobId: 'system-workflow-motion-execution',
          },
          organizationId: 'org-1',
          userId: 'user-1',
          source: 'workflow-failure:visual-code.execute',
        });
        expect(mockSystemWorkflowRunner.startWorkflow).not.toHaveBeenCalled();
        expect(mockExecutor.continueExistingExecution).not.toHaveBeenCalled();
        expect(job.updateData).not.toHaveBeenCalled();
      },
    );

    it('blocks a revoked delayed resume before the executor can fire another node', async () => {
      mockQueue.runWithQueuedOrganizationModule.mockRejectedValueOnce(
        new Error('Module disabled'),
      );
      await expect(
        processor.process(createMockJob({ type: 'delay-resume' }) as never),
      ).rejects.toThrow('Module disabled');
      expect(mockExecutor.resumeAfterDelay).not.toHaveBeenCalled();
    });
  });

  describe('process - system workflow jobs', () => {
    it.each([
      WORKFLOW_EXECUTION_QUEUE,
      WORKFLOW_BACKGROUND_QUEUE,
      PLATFORM_SYSTEM_WORKFLOW_QUEUE,
    ])('schedules the first system-workflow delay on %s', async (queueName) => {
      const delayData = {
        delayNodeId: 'delay-1',
        executionId: 'exec-system',
        workflowId: 'wf-system',
        organizationId: 'org-1',
        userId: 'user-1',
        remainingNodeIds: ['next'],
        triggerEvent: {
          type: 'manual',
          platform: 'manual',
          data: {},
          organizationId: 'org-1',
          userId: 'user-1',
        },
        nodeOutputCache: { 'delay-1': { delayMs: 5000 } },
      };
      mockSystemWorkflowRunner.startWorkflow.mockResolvedValueOnce({
        execution: {
          _delayJobData: delayData,
          executionId: 'exec-system',
          nodeResults: [],
          startedAt: new Date(),
          status: WorkflowExecutionStatus.RUNNING,
          totalCreditsUsed: 0,
          workflowId: 'wf-system',
        },
        provenance: {
          executionId: 'exec-system',
          workflowId: 'wf-system',
          workflowLabel: 'System workflow',
        },
        userId: 'user-1',
      });
      await processor.process(
        createMockJob(
          {
            type: 'system-run',
            systemRun: {
              input: {
                actionType: 'clip.factory',
                canonicalId: 'clip.factory',
                organizationId: 'org-1',
                source: 'clip-analysis-completion',
              },
            },
          },
          { queueName },
        ) as never,
      );
      expect(mockQueue.queueDelayedResume).toHaveBeenCalledWith(
        delayData,
        5000,
        queueName,
      );
    });

    it('resolves the queued canonical identity through the system workflow runner', async () => {
      const input = {
        actionType: 'clip-continuity',
        canonicalId: 'clip-continuity:v1:1',
        organizationId: 'org-1',
        source: 'clip-generation-completion',
      };

      await expect(
        processor.process(
          createMockJob({
            systemRun: { input },
            type: 'system-run',
          }) as never,
        ),
      ).resolves.toEqual({
        executionId: 'exec-system',
        status: WorkflowExecutionStatus.COMPLETED,
        workflowId: 'wf-system',
      });
      expect(mockSystemWorkflowRunner.startWorkflow).toHaveBeenCalledWith(
        input,
      );
    });

    it('accepts a durable review-gate pause without projecting failure', async () => {
      mockSystemWorkflowRunner.startWorkflow.mockResolvedValueOnce({
        execution: {
          executionId: 'exec-paused',
          nodeResults: [],
          startedAt: new Date(),
          status: WorkflowExecutionStatus.RUNNING,
          totalCreditsUsed: 0,
          workflowId: 'wf-system',
        },
        provenance: {
          executionId: 'exec-paused',
          workflowId: 'wf-system',
          workflowLabel: 'Clip factory',
        },
        userId: 'user-1',
      });
      const input = {
        actionType: 'clip.factory',
        canonicalId: 'clip.factory',
        organizationId: 'org-1',
        source: 'clip-analysis-completion',
      };

      await expect(
        processor.process(
          createMockJob({
            systemRun: {
              input,
            },
            type: 'system-run',
          }) as never,
        ),
      ).resolves.toEqual({
        executionId: 'exec-paused',
        status: WorkflowExecutionStatus.RUNNING,
        workflowId: 'wf-system',
      });
    });

    it('runs a precreated parent execution on the first queue attempt', async () => {
      const input = {
        actionType: 'campaign.reply.execute-target',
        canonicalId: 'campaign.reply.execute-target',
        organizationId: 'org-1',
        source: 'workflow.for-each',
        userId: 'user-1',
      };
      mockExecutor.continueExistingExecution.mockResolvedValueOnce({
        executionId: 'exec-prior',
        nodeResults: [],
        startedAt: new Date(),
        status: WorkflowExecutionStatus.COMPLETED,
        totalCreditsUsed: 0,
        workflowId: 'wf-system',
      });

      await expect(
        processor.process(
          createMockJob(
            {
              systemRun: {
                input,
                priorExecution: {
                  executionId: 'exec-prior',
                  status: WorkflowExecutionStatus.PENDING,
                  userId: 'user-1',
                  workflowId: 'wf-system',
                  workflowLabel: 'Campaign reply',
                },
              },
              type: 'system-run',
            },
            { attemptsMade: 0 },
          ) as never,
        ),
      ).resolves.toMatchObject({
        executionId: 'exec-prior',
        status: WorkflowExecutionStatus.COMPLETED,
      });
      expect(mockSystemWorkflowRunner.startWorkflow).not.toHaveBeenCalled();
      expect(mockExecutor.continueExistingExecution).toHaveBeenCalledWith(
        'exec-prior',
        expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      );
    });

    it('does not compensate a failed workflow before its terminal queue attempt', async () => {
      mockSystemWorkflowRunner.startWorkflow.mockRejectedValueOnce(
        new Error('QA provider ETIMEDOUT'),
      );
      const input = {
        actionType: 'clip-continuity',
        canonicalId: 'clip.continuity',
        organizationId: 'org-1',
        source: 'clip-generation-completion',
        userId: 'user-1',
      };

      await expect(
        processor.process(
          createMockJob(
            {
              systemRun: {
                failureWorkflow: {
                  canonicalId: 'clip.continuity.failure',
                  inputValues: { projectId: 'project-1' },
                },
                input,
              },
              type: 'system-run',
            },
            { opts: { attempts: 2 } },
          ) as never,
        ),
      ).rejects.toThrow('QA provider ETIMEDOUT');
      expect(mockSystemWorkflowRunner.runWorkflow).not.toHaveBeenCalled();
      expect(
        mockSystemWorkflowRunner.getRegisteredFailureWorkflow,
      ).not.toHaveBeenCalled();
    });

    it('runs registered failure compensation on the terminal queue attempt', async () => {
      mockSystemWorkflowRunner.startWorkflow.mockRejectedValueOnce(
        new Error('QA failed'),
      );
      const input = {
        actionType: 'clip-continuity',
        canonicalId: 'clip.continuity',
        organizationId: 'org-1',
        source: 'clip-generation-completion',
        userId: 'user-1',
      };

      await expect(
        processor.process(
          createMockJob(
            {
              systemRun: {
                failureWorkflow: {
                  canonicalId: 'clip.continuity.failure',
                  inputValues: {
                    projectId: 'project-1',
                    workflowError: 'stale queued error',
                  },
                },
                input,
              },
              type: 'system-run',
            },
            { attemptsMade: 1, opts: { attempts: 2 } },
          ) as never,
        ),
      ).rejects.toThrow('QA failed');
      expect(mockSystemWorkflowRunner.runWorkflow).toHaveBeenCalledWith({
        actionType: 'clip.continuity.failure',
        canonicalId: 'clip.continuity.failure',
        inputValues: { projectId: 'project-1', workflowError: 'QA failed' },
        metadata: {
          failedCanonicalId: 'clip.continuity',
          failedJobId: 'job-1',
        },
        organizationId: 'org-1',
        source: 'workflow-failure:clip.continuity',
        userId: 'user-1',
      });
    });

    describe('when compensation also fails (#6655)', () => {
      const input = {
        actionType: 'clip.analysis',
        canonicalId: 'clip.analysis',
        inputValues: { job: { orgId: 'org-1', projectId: 'project-1' } },
        organizationId: 'org-1',
        source: 'clip-analysis',
        userId: 'user-1',
      };
      const job = () =>
        createMockJob({
          systemRun: {
            failureWorkflow: {
              canonicalId: 'clip.analysis.failure',
              inputValues: input.inputValues,
            },
            input,
          },
          type: 'system-run',
        });

      beforeEach(() => {
        mockSystemWorkflowRunner.startWorkflow.mockRejectedValueOnce(
          new Error('Action contract input validation failed [action=x]'),
        );
        mockSystemWorkflowRunner.runWorkflow.mockRejectedValueOnce(
          new Error('Action contract input validation failed [action=y]'),
        );
      });

      it('settles the owned record through the last resort and reports it once', async () => {
        mockSystemWorkflowRunner.terminalFailures.settle.mockResolvedValueOnce(
          true,
        );

        await expect(processor.process(job() as never)).rejects.toThrow(
          'System workflow clip.analysis and registered failure workflow clip.analysis.failure both failed',
        );

        expect(
          mockSystemWorkflowRunner.terminalFailures.settle,
        ).toHaveBeenCalledWith(
          input,
          'Action contract input validation failed [action=x]',
        );
        expect(mockLogger.error).toHaveBeenCalledWith(
          'WorkflowExecutionProcessor workflow and failure workflow both failed',
          expect.any(AggregateError),
          {
            canonicalId: 'clip.analysis',
            failureCanonicalId: 'clip.analysis.failure',
            isSettled: true,
            jobId: 'job-1',
            organizationId: 'org-1',
          },
        );
      });

      it('still fails the job terminally when the last resort throws', async () => {
        mockSystemWorkflowRunner.terminalFailures.settle.mockRejectedValueOnce(
          new Error('database unavailable'),
        );

        await expect(processor.process(job() as never)).rejects.toThrow(
          'both failed',
        );

        expect(mockLogger.error).toHaveBeenCalledWith(
          'WorkflowExecutionProcessor terminal failure settlement failed',
          expect.any(Error),
          { canonicalId: 'clip.analysis', jobId: 'job-1' },
        );
        expect(mockLogger.error).toHaveBeenCalledWith(
          'WorkflowExecutionProcessor workflow and failure workflow both failed',
          expect.any(AggregateError),
          expect.objectContaining({ isSettled: false }),
        );
      });
    });

    describe('deterministic contract failures are terminal (#5622)', () => {
      const CONTRACT_ERROR =
        'Nodes failed: finalize: Action contract input validation failed [action=agent.autopilot.finalize workflow=wf version=v run=r node=finalize] /batch: must be array';
      const input = {
        actionType: 'agent.autopilot.proactive',
        canonicalId: 'agent.autopilot.proactive',
        organizationId: 'org-1',
        source: 'PlatformWorkflowSchedulesService',
        userId: 'user-1',
      };

      function mockFailedRun(error: string) {
        mockSystemWorkflowRunner.startWorkflow.mockResolvedValueOnce({
          execution: {
            error,
            executionId: 'exec-failed',
            nodeResults: [],
            startedAt: new Date(),
            status: WorkflowExecutionStatus.FAILED,
            totalCreditsUsed: 0,
            workflowId: 'wf-1',
          },
          provenance: {
            executionId: 'exec-failed',
            workflowId: 'wf-1',
            workflowLabel: 'Proactive',
          },
          userId: 'user-1',
        });
      }

      it('throws UnrecoverableError on the first attempt so BullMQ never retries it', async () => {
        mockFailedRun(CONTRACT_ERROR);

        const failure = await processor
          .process(
            createMockJob(
              { systemRun: { input }, type: 'system-run' },
              { attemptsMade: 0, opts: { attempts: 3 } },
            ) as never,
          )
          .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(UnrecoverableError);
        expect((failure as Error).message).toBe(CONTRACT_ERROR);
      });

      it('still runs failure compensation, since an unrecoverable job gets no later attempt', async () => {
        mockFailedRun(CONTRACT_ERROR);

        await expect(
          processor.process(
            createMockJob(
              {
                systemRun: {
                  failureWorkflow: { canonicalId: 'agent.autopilot.fail' },
                  input,
                },
                type: 'system-run',
              },
              { attemptsMade: 0, opts: { attempts: 3 } },
            ) as never,
          ),
        ).rejects.toBeInstanceOf(UnrecoverableError);
        expect(mockSystemWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({ canonicalId: 'agent.autopilot.fail' }),
        );
      });

      it('fails a non-transient failure once, with compensation, instead of retrying it', async () => {
        mockSystemWorkflowRunner.startWorkflow.mockRejectedValueOnce(
          new Error('Unknown system workflow: nope'),
        );

        await expect(
          processor.process(
            createMockJob(
              {
                systemRun: {
                  failureWorkflow: { canonicalId: 'agent.autopilot.fail' },
                  input,
                },
                type: 'system-run',
              },
              { attemptsMade: 0, opts: { attempts: 3 } },
            ) as never,
          ),
        ).rejects.toBeInstanceOf(UnrecoverableError);
        expect(mockSystemWorkflowRunner.runWorkflow).toHaveBeenCalledTimes(1);
      });

      it('keeps a failed terminal compensation unrecoverable and retains both causes', async () => {
        mockSystemWorkflowRunner.startWorkflow.mockRejectedValueOnce(
          new Error('Source acquisition rejected'),
        );
        mockSystemWorkflowRunner.runWorkflow.mockRejectedValueOnce(
          new Error('Failure projection rejected'),
        );
        const failure = await processor
          .process(
            createMockJob(
              {
                type: 'system-run',
                systemRun: {
                  input,
                  failureWorkflow: { canonicalId: 'clip.analysis.failure' },
                },
              },
              { opts: { attempts: 3 } },
            ) as never,
          )
          .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(UnrecoverableError);
        expect((failure as Error).cause).toBeInstanceOf(AggregateError);
        expect(
          ((failure as Error).cause as AggregateError).errors,
        ).toHaveLength(2);
      });

      it('keeps a transient node failure retryable', async () => {
        mockFailedRun('Nodes failed: infer: upstream 503');

        const failure = await processor
          .process(
            createMockJob(
              { systemRun: { input }, type: 'system-run' },
              { attemptsMade: 0, opts: { attempts: 3 } },
            ) as never,
          )
          .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(Error);
        expect(failure).not.toBeInstanceOf(UnrecoverableError);
      });
    });
  });

  describe('process - trigger jobs', () => {
    it('should handle trigger events via executor service', async () => {
      let capturedContext:
        | ReturnType<typeof getActionOriginContext>
        | undefined;
      mockExecutor.handleTriggerEvent.mockImplementation(async () => {
        capturedContext = getActionOriginContext();
        return [
          {
            executionId: 'exec-1',
            nodeResults: [],
            startedAt: new Date(),
            status: WorkflowExecutionStatus.COMPLETED,
            totalCreditsUsed: 0,
            workflowId: 'wf-1',
          },
        ];
      });
      const job = createMockJob({
        actionContext: {
          actorUserId: 'user-1',
          apiKeyId: 'key-1',
          origin: ActionOrigin.MCP,
        },
        triggerEvent: {
          data: { postId: 'post-1' },
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        type: 'trigger',
      });

      const result = await processor.process(job as never);

      expect(mockExecutor.handleTriggerEvent).toHaveBeenCalledWith(
        job.data.triggerEvent,
      );
      expect(result).toEqual(
        expect.objectContaining({
          executionCount: 1,
        }),
      );
      expect(capturedContext).toEqual(job.data.actionContext);
    });

    it('should throw when trigger event data is missing', async () => {
      const job = createMockJob({
        type: 'trigger',
      });

      await expect(processor.process(job as never)).rejects.toThrow(
        'missing triggerEvent',
      );
    });

    it('continues prior executions on BullMQ retry instead of re-triggering (#2359)', async () => {
      mockExecutor.continueExistingExecution
        .mockResolvedValueOnce({
          executionId: 'exec-1',
          nodeResults: [],
          startedAt: new Date(),
          status: WorkflowExecutionStatus.COMPLETED,
          totalCreditsUsed: 0,
          workflowId: 'wf-1',
        })
        .mockResolvedValueOnce({
          executionId: 'exec-2',
          nodeResults: [],
          startedAt: new Date(),
          status: WorkflowExecutionStatus.FAILED,
          totalCreditsUsed: 0,
          workflowId: 'wf-2',
        });

      const job = createMockJob(
        {
          priorExecutionIds: ['exec-1', 'exec-2'],
          triggerEvent: {
            data: {},
            organizationId: 'org-1',
            platform: 'twitter',
            type: 'mentionTrigger',
            userId: 'user-1',
          },
          type: 'trigger',
        },
        { attemptsMade: 1 },
      );

      const result = await processor.process(job as never);

      expect(mockExecutor.handleTriggerEvent).not.toHaveBeenCalled();
      expect(mockExecutor.continueExistingExecution).toHaveBeenCalledTimes(2);
      expect(mockExecutor.continueExistingExecution).toHaveBeenNthCalledWith(
        1,
        'exec-1',
        job.data.triggerEvent,
      );
      expect(result).toEqual(
        expect.objectContaining({
          continuedOnRetry: true,
          priorExecutionIds: ['exec-1', 'exec-2'],
          executionCount: 2,
        }),
      );
    });

    it('persists priorExecutionIds after the first trigger attempt', async () => {
      const job = createMockJob({
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        type: 'trigger',
      });

      await processor.process(job as never);

      expect(job.updateData).toHaveBeenCalledWith(
        expect.objectContaining({
          priorExecutionIds: ['exec-1'],
        }),
      );
    });

    it('falls through to handleTriggerEvent on retry without priorExecutionIds', async () => {
      const job = createMockJob(
        {
          triggerEvent: {
            data: {},
            organizationId: 'org-1',
            platform: 'twitter',
            type: 'mentionTrigger',
            userId: 'user-1',
          },
          type: 'trigger',
        },
        { attemptsMade: 2 },
      );

      await processor.process(job as never);

      expect(mockExecutor.handleTriggerEvent).toHaveBeenCalledTimes(1);
      expect(mockExecutor.continueExistingExecution).not.toHaveBeenCalled();
    });

    it('falls through when priorExecutionIds is an empty array on retry', async () => {
      const job = createMockJob(
        {
          priorExecutionIds: [],
          triggerEvent: {
            data: {},
            organizationId: 'org-1',
            platform: 'twitter',
            type: 'mentionTrigger',
            userId: 'user-1',
          },
          type: 'trigger',
        },
        { attemptsMade: 1 },
      );

      await processor.process(job as never);

      expect(mockExecutor.handleTriggerEvent).toHaveBeenCalledTimes(1);
      expect(mockExecutor.continueExistingExecution).not.toHaveBeenCalled();
    });

    it('schedules delay resume jobs when continuing prior executions on retry', async () => {
      const delayJobData = {
        delayNodeId: 'delay-1',
        executionId: 'exec-1',
        nodeOutputCache: {
          'delay-1': { delayMs: 60000, resumeAt: new Date().toISOString() },
        },
        organizationId: 'org-1',
        remainingNodeIds: ['action-1'],
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        userId: 'user-1',
        workflowId: 'wf-1',
      };

      mockExecutor.continueExistingExecution.mockResolvedValueOnce({
        _delayJobData: delayJobData,
        executionId: 'exec-1',
        nodeResults: [],
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
        totalCreditsUsed: 0,
        workflowId: 'wf-1',
      });

      const job = createMockJob(
        {
          priorExecutionIds: ['exec-1'],
          triggerEvent: delayJobData.triggerEvent,
          type: 'trigger',
        },
        { attemptsMade: 1 },
      );

      await processor.process(job as never);

      expect(mockQueue.queueDelayedResume).toHaveBeenCalledWith(
        delayJobData,
        expect.any(Number),
        WORKFLOW_EXECUTION_QUEUE,
      );
      expect(mockExecutor.handleTriggerEvent).not.toHaveBeenCalled();
    });

    it('should detect and schedule delay resume jobs', async () => {
      const delayJobData = {
        delayNodeId: 'delay-1',
        executionId: 'exec-1',
        nodeOutputCache: {
          'delay-1': { delayMs: 60000, resumeAt: new Date().toISOString() },
        },
        organizationId: 'org-1',
        remainingNodeIds: ['action-1'],
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        userId: 'user-1',
        workflowId: 'wf-1',
      };

      mockExecutor.handleTriggerEvent.mockResolvedValue([
        {
          _delayJobData: delayJobData,
          executionId: 'exec-1',
          nodeResults: [],
          startedAt: new Date(),
          status: WorkflowExecutionStatus.RUNNING,
          totalCreditsUsed: 0,
          workflowId: 'wf-1',
        },
      ]);

      const job = createMockJob({
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        type: 'trigger',
      });

      await processor.process(job as never);

      expect(mockQueue.queueDelayedResume).toHaveBeenCalledWith(
        delayJobData,
        60000,
        WORKFLOW_EXECUTION_QUEUE,
      );
    });
  });

  describe('process - delay resume jobs', () => {
    it.each([
      WORKFLOW_EXECUTION_QUEUE,
      WORKFLOW_BACKGROUND_QUEUE,
      PLATFORM_SYSTEM_WORKFLOW_QUEUE,
    ])('keeps successive delays on %s', async (queueName) => {
      const nextDelay = {
        delayNodeId: 'delay-2',
        executionId: 'exec-1',
        nodeOutputCache: {
          'delay-2': { delayMs: 45_000 },
        },
        organizationId: 'org-1',
        remainingNodeIds: ['publish'],
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'manual',
          type: 'manual',
          userId: 'user-1',
        },
        userId: 'user-1',
        workflowId: 'wf-1',
      };
      mockExecutor.resumeAfterDelay.mockResolvedValueOnce({
        _delayJobData: nextDelay,
        executionId: 'exec-1',
        nodeResults: [],
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
        totalCreditsUsed: 0,
        workflowId: 'wf-1',
      });

      await processor.process(
        createMockJob(
          {
            delayResumeData: {
              ...nextDelay,
              delayNodeId: 'delay-1',
            },
            type: 'delay-resume',
          },
          { queueName },
        ) as never,
      );

      expect(mockQueue.queueDelayedResume).toHaveBeenCalledWith(
        nextDelay,
        45_000,
        queueName,
      );
    });
  });

  describe('process - delay-resume jobs', () => {
    it('should resume execution via executor service', async () => {
      const delayResumeData = {
        delayNodeId: 'delay-1',
        executionId: 'exec-1',
        nodeOutputCache: {},
        organizationId: 'org-1',
        remainingNodeIds: ['action-1'],
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        userId: 'user-1',
        workflowId: 'wf-1',
      };

      const job = createMockJob({
        delayResumeData,
        type: 'delay-resume',
      });

      const result = await processor.process(job as never);

      expect(mockExecutor.resumeAfterDelay).toHaveBeenCalledWith(
        delayResumeData,
      );
      expect(result).toEqual(
        expect.objectContaining({
          executionId: 'exec-1',
          status: WorkflowExecutionStatus.COMPLETED,
        }),
      );
    });

    it('should throw when delay resume data is missing', async () => {
      const job = createMockJob({
        type: 'delay-resume',
      });

      await expect(processor.process(job as never)).rejects.toThrow(
        'missing delayResumeData',
      );
    });
  });

  describe('process - scheduled-fire jobs', () => {
    it('should execute the scheduled workflow via the scheduler service', async () => {
      const job = createMockJob({
        type: 'scheduled-fire',
        workflowId: 'wf-1',
      });

      const result = await processor.process(job as never);

      expect(mockScheduler.executeScheduledWorkflow).toHaveBeenCalledWith(
        'wf-1',
        'job-1',
      );
      expect(result).toEqual({ workflowId: 'wf-1' });
    });

    it('should throw when workflowId is missing', async () => {
      const job = createMockJob({
        type: 'scheduled-fire',
      });

      await expect(processor.process(job as never)).rejects.toThrow(
        'missing workflowId',
      );
      expect(mockScheduler.executeScheduledWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('process - unknown job types', () => {
    it('should throw for unknown job type', async () => {
      const job = createMockJob({
        type: 'unknown' as WorkflowExecutionJobData['type'],
      });

      await expect(processor.process(job as never)).rejects.toThrow(
        'Unknown workflow execution job type',
      );
    });
  });

  describe('delay calculation', () => {
    it('should calculate delay from delayMs in node output cache', async () => {
      const futureTime = new Date(Date.now() + 300000).toISOString();
      const delayJobData = {
        delayNodeId: 'delay-1',
        executionId: 'exec-1',
        nodeOutputCache: {
          'delay-1': { delayMs: 300000, resumeAt: futureTime },
        },
        organizationId: 'org-1',
        remainingNodeIds: ['action-1'],
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        userId: 'user-1',
        workflowId: 'wf-1',
      };

      mockExecutor.handleTriggerEvent.mockResolvedValue([
        {
          _delayJobData: delayJobData,
          executionId: 'exec-1',
          nodeResults: [],
          startedAt: new Date(),
          status: WorkflowExecutionStatus.RUNNING,
          totalCreditsUsed: 0,
          workflowId: 'wf-1',
        },
      ]);

      const job = createMockJob({
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        type: 'trigger',
      });

      await processor.process(job as never);

      expect(mockQueue.queueDelayedResume).toHaveBeenCalledWith(
        delayJobData,
        300000,
        WORKFLOW_EXECUTION_QUEUE,
      );
    });
  });

  describe('logging', () => {
    it('should log job processing start', async () => {
      const job = createMockJob({
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        type: 'trigger',
      });

      await processor.process(job as never);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('processing job'),
        expect.objectContaining({
          jobId: 'job-1',
          type: 'trigger',
        }),
      );
    });

    it('should log errors on failure', async () => {
      mockExecutor.handleTriggerEvent.mockRejectedValue(
        new Error('Service unavailable'),
      );

      const job = createMockJob({
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        type: 'trigger',
      });

      await expect(processor.process(job as never)).rejects.toThrow(
        'Service unavailable',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('job failed'),
        expect.any(Error),
        expect.objectContaining({
          jobId: 'job-1',
        }),
      );
    });
  });
});
