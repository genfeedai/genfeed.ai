import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import {
  WorkflowDelayProcessor,
  WorkflowExecutionProcessor,
} from '@api/queues/workflow/workflow-execution.processor';
import { WorkflowQueueService } from '@api/queues/workflow/workflow-queue.service';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('WorkflowExecutionProcessor', () => {
  let processor: WorkflowExecutionProcessor;
  let mockWorkflowsService: { findOne: ReturnType<typeof vi.fn> };
  let mockExecutionsService: {
    startExecution: ReturnType<typeof vi.fn>;
    completeExecution: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let mockEngineAdapter: { executeWorkflow: ReturnType<typeof vi.fn> };
  let mockQueueService: { queueExecution: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockWorkflowsService = {
      findOne: vi.fn().mockResolvedValue({
        _id: 'wf-1',
        edges: [],
        nodes: [],
        organization: 'org-1',
        user: 'user-1',
      }),
    };

    mockExecutionsService = {
      completeExecution: vi.fn().mockResolvedValue(null),
      findOne: vi.fn().mockResolvedValue(null),
      startExecution: vi.fn().mockResolvedValue(null),
      updateNodeResult: vi.fn().mockResolvedValue(null),
    };

    mockEngineAdapter = {
      convertToExecutableWorkflow: vi.fn().mockReturnValue({
        edges: [],
        id: 'wf-1',
        lockedNodeIds: [],
        nodes: [],
        organizationId: 'org-1',
        userId: 'user-1',
      }),
      executeWorkflow: vi.fn().mockResolvedValue({
        error: undefined,
        nodeResults: new Map(),
        runId: 'run-1',
        startedAt: new Date(),
        status: 'completed',
        totalCreditsUsed: 0,
        workflowId: 'wf-1',
      }),
    };

    mockQueueService = {
      queueDelayedResume: vi.fn().mockResolvedValue('delay-job-1'),
      queueExecution: vi.fn().mockResolvedValue('job-1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowExecutionProcessor,
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        { provide: WorkflowsService, useValue: mockWorkflowsService },
        { provide: WorkflowExecutionsService, useValue: mockExecutionsService },
        { provide: WorkflowEngineAdapterService, useValue: mockEngineAdapter },
        { provide: WorkflowQueueService, useValue: mockQueueService },
      ],
    }).compile();

    processor = module.get<WorkflowExecutionProcessor>(
      WorkflowExecutionProcessor,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should start execution and run workflow', async () => {
    const job = {
      data: {
        executionId: 'exec-1',
        organizationId: 'org-1',
        trigger: 'manual',
        userId: 'user-1',
        workflowId: 'wf-1',
      },
      name: 'execute-workflow',
    } as any;

    await processor.process(job);

    expect(mockExecutionsService.startExecution).toHaveBeenCalledWith('exec-1');
    expect(mockWorkflowsService.findOne).toHaveBeenCalledWith({ _id: 'wf-1' });
    expect(mockEngineAdapter.executeWorkflow).toHaveBeenCalled();
    expect(mockExecutionsService.completeExecution).toHaveBeenCalledWith(
      'exec-1',
      undefined,
    );
  });

  it('should handle workflow not found', async () => {
    mockWorkflowsService.findOne.mockResolvedValue(null);

    const job = {
      data: {
        executionId: 'exec-1',
        organizationId: 'org-1',
        trigger: 'manual',
        userId: 'user-1',
        workflowId: 'wf-missing',
      },
      name: 'execute-workflow',
    } as any;

    await expect(processor.process(job)).rejects.toThrow('not found');
    expect(mockExecutionsService.completeExecution).toHaveBeenCalledWith(
      'exec-1',
      expect.stringContaining('not found'),
    );
  });
});

describe('WorkflowDelayProcessor', () => {
  let processor: WorkflowDelayProcessor;
  let mockExecutionsService: {
    startExecution: ReturnType<typeof vi.fn>;
    completeExecution: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let mockQueueService: { queueExecution: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockExecutionsService = {
      findOne: vi.fn().mockResolvedValue({
        _id: 'exec-1',
        status: WorkflowExecutionStatus.RUNNING,
      }),
    };

    mockQueueService = {
      queueExecution: vi.fn().mockResolvedValue('job-1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowDelayProcessor,
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        { provide: WorkflowQueueService, useValue: mockQueueService },
        { provide: WorkflowExecutionsService, useValue: mockExecutionsService },
      ],
    }).compile();

    processor = module.get<WorkflowDelayProcessor>(WorkflowDelayProcessor);
  });

  it('should resume workflow execution after delay', async () => {
    const job = {
      data: {
        delayNodeId: 'delay-1',
        executionId: 'exec-1',
        organizationId: 'org-1',
        resumeAt: new Date().toISOString(),
        scheduledAt: new Date().toISOString(),
        userId: 'user-1',
        workflowId: 'wf-1',
      },
      name: 'delay-resume',
    } as any;

    await processor.process(job);

    expect(mockQueueService.queueExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'exec-1',
        resumeFromNodeId: 'delay-1',
        trigger: 'resume',
      }),
    );
  });

  it('should skip resume for cancelled execution', async () => {
    mockExecutionsService.findOne.mockResolvedValue({
      _id: 'exec-1',
      status: WorkflowExecutionStatus.CANCELLED,
    });

    const job = {
      data: {
        delayNodeId: 'delay-1',
        executionId: 'exec-1',
        organizationId: 'org-1',
        resumeAt: new Date().toISOString(),
        scheduledAt: new Date().toISOString(),
        userId: 'user-1',
        workflowId: 'wf-1',
      },
      name: 'delay-resume',
    } as any;

    await processor.process(job);

    expect(mockQueueService.queueExecution).not.toHaveBeenCalled();
  });
});
