import { PostsService } from '@api/collections/posts/services/posts.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { Workflow } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { AVATAR_UGC_WORKFLOW_TEMPLATE } from '@api/collections/workflows/templates/avatar-ugc-workflow.template';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { TaskQueueClientService } from '@api/services/task-queue-client/task-queue-client.service';
import {
  WorkflowExecutionTrigger,
  WorkflowStatus,
  WorkflowTrigger,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

// Valid 24-char hex strings for ObjectId construction
const TEST_WORKFLOW_ID = '507f1f77bcf86cd799439011';
const TEST_USER_ID = '507f1f77bcf86cd799439012';
const TEST_ORG_ID = '507f1f77bcf86cd799439013';
const TEST_RUN_ID = '507f1f77bcf86cd799439014';

describe('WorkflowsService', () => {
  let service: WorkflowsService;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockWorkflowModel = {
    aggregate: vi.fn(),
    aggregatePaginate: vi.fn(),
    collection: {
      name: 'workflows',
    },
    countDocuments: vi.fn(),
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn(),
  };

  const mockPostsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
  };

  const mockNotificationsPublisherService = {
    publish: vi.fn(),
    sendNotification: vi.fn(),
  };

  const mockTaskQueueClientService = {
    addJob: vi.fn(),
    getJob: vi.fn(),
  };

  const mockWorkflowExecutionsService = {
    completeExecution: vi.fn(),
    createExecution: vi.fn(),
    findOne: vi.fn(),
    setCreditsUsed: vi.fn(),
    setFailedNodeId: vi.fn(),
    startExecution: vi.fn(),
    updateNodeResult: vi.fn(),
  };

  const mockWorkflowExecutorService = {
    executeManualWorkflow: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowsService,
        {
          provide: getModelToken(Workflow.name, DB_CONNECTIONS.CLOUD),
          useValue: mockWorkflowModel,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: PostsService,
          useValue: mockPostsService,
        },
        {
          provide: NotificationsPublisherService,
          useValue: mockNotificationsPublisherService,
        },
        {
          provide: TaskQueueClientService,
          useValue: mockTaskQueueClientService,
        },
        {
          provide: WorkflowExecutionsService,
          useValue: mockWorkflowExecutionsService,
        },
        {
          provide: WorkflowExecutorService,
          useValue: mockWorkflowExecutorService,
        },
      ],
    }).compile();

    service = module.get<WorkflowsService>(WorkflowsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should find a workflow with default population', async () => {
      const mockWorkflow = {
        _id: TEST_WORKFLOW_ID,
        name: 'Test Workflow',
        status: 'active',
      };

      mockWorkflowModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockWorkflow),
        lean: vi.fn().mockResolvedValue(mockWorkflow),
        populate: vi.fn().mockReturnThis(),
      });

      await service.findOne({ _id: TEST_WORKFLOW_ID });

      expect(mockWorkflowModel.findOne).toHaveBeenCalled();
    });
  });

  describe('createWorkflow', () => {
    it('should preserve an explicitly requested workflow status', async () => {
      const createdWorkflow = {
        _id: TEST_WORKFLOW_ID,
        label: 'Draft workflow',
        toObject: vi.fn().mockReturnValue({
          _id: TEST_WORKFLOW_ID,
          label: 'Draft workflow',
          status: WorkflowStatus.DRAFT,
        }),
      };

      vi.spyOn(service, 'create').mockResolvedValue(createdWorkflow as never);

      const result = await service.createWorkflow(TEST_USER_ID, TEST_ORG_ID, {
        label: 'Draft workflow',
        status: WorkflowStatus.DRAFT,
        trigger: WorkflowTrigger.SCHEDULED,
      });

      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: WorkflowStatus.DRAFT,
        }),
      );
      expect(result._id).toBe(TEST_WORKFLOW_ID);
    });

    it('hydrates seeded template graph fields when create payload passes empty arrays', async () => {
      const createdWorkflow = {
        _id: TEST_WORKFLOW_ID,
        label: 'Avatar UGC',
        toObject: vi.fn().mockReturnValue({
          _id: TEST_WORKFLOW_ID,
          label: 'Avatar UGC',
          templateId: 'avatar-ugc-heygen',
        }),
      };

      vi.spyOn(service, 'create').mockResolvedValue(createdWorkflow as never);

      await service.createWorkflow(TEST_USER_ID, TEST_ORG_ID, {
        edges: [],
        inputVariables: [],
        label: 'Avatar UGC',
        nodes: [],
        templateId: 'avatar-ugc-heygen',
        trigger: WorkflowTrigger.SCHEDULED,
      } as never);

      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          edges: AVATAR_UGC_WORKFLOW_TEMPLATE.edges,
          inputVariables: AVATAR_UGC_WORKFLOW_TEMPLATE.inputVariables,
          nodes: AVATAR_UGC_WORKFLOW_TEMPLATE.nodes,
          templateId: 'avatar-ugc-heygen',
        }),
      );
    });
  });

  describe('generateWebhook', () => {
    it('should generate webhook with secret auth type', async () => {
      const patchSpy = vi.spyOn(service, 'patch').mockResolvedValue({} as any);

      const result = await service.generateWebhook(TEST_WORKFLOW_ID, 'secret');

      expect(result.webhookId).toBeDefined();
      expect(result.webhookSecret).toBeDefined();
      expect(result.authType).toBe('secret');
      expect(result.webhookUrl).toContain(result.webhookId);
      expect(patchSpy).toHaveBeenCalledWith(
        TEST_WORKFLOW_ID,
        expect.objectContaining({
          webhookAuthType: 'secret',
          webhookId: expect.any(String),
          webhookSecret: expect.any(String),
        }),
      );
    });

    it('should generate webhook with none auth type', async () => {
      vi.spyOn(service, 'patch').mockResolvedValue({} as any);

      const result = await service.generateWebhook(TEST_WORKFLOW_ID, 'none');

      expect(result.webhookId).toBeDefined();
      expect(result.webhookSecret).toBeNull();
      expect(result.authType).toBe('none');
    });

    it('should generate webhook with bearer auth type', async () => {
      vi.spyOn(service, 'patch').mockResolvedValue({} as any);

      const result = await service.generateWebhook(TEST_WORKFLOW_ID, 'bearer');

      expect(result.webhookId).toBeDefined();
      expect(result.webhookSecret).toBeDefined();
      expect(result.authType).toBe('bearer');
    });
  });

  describe('executeWorkflowCompat', () => {
    it('delegates node workflows to the workflow executor service', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        _id: TEST_WORKFLOW_ID,
        nodes: [{ id: 'node-1', type: 'ai-generate-image' }],
      } as never);
      mockWorkflowExecutorService.executeManualWorkflow.mockResolvedValue({
        executionId: TEST_RUN_ID,
        status: 'running',
      });

      const result = await service.executeWorkflowCompat(
        TEST_WORKFLOW_ID,
        TEST_USER_ID,
        TEST_ORG_ID,
        { prompt: 'hello' },
        { source: 'compat' },
        WorkflowExecutionTrigger.API,
      );

      expect(
        mockWorkflowExecutorService.executeManualWorkflow,
      ).toHaveBeenCalledWith(
        TEST_WORKFLOW_ID,
        TEST_USER_ID,
        TEST_ORG_ID,
        { prompt: 'hello' },
        { source: 'compat' },
        WorkflowExecutionTrigger.API,
      );
      expect(result).toEqual({
        executionId: TEST_RUN_ID,
        mode: 'node',
      });
    });

    it('keeps step-only workflows on the legacy execution path', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        _id: TEST_WORKFLOW_ID,
        nodes: [],
      } as never);
      const executeWorkflowSpy = vi
        .spyOn(service, 'executeWorkflow')
        .mockResolvedValue(undefined);

      const result = await service.executeWorkflowCompat(
        TEST_WORKFLOW_ID,
        TEST_USER_ID,
        TEST_ORG_ID,
      );

      expect(executeWorkflowSpy).toHaveBeenCalledWith(TEST_WORKFLOW_ID);
      expect(
        mockWorkflowExecutorService.executeManualWorkflow,
      ).not.toHaveBeenCalled();
      expect(result).toEqual({
        mode: 'legacy',
      });
    });
  });

  describe('executePartial', () => {
    it('creates and starts a tracked execution before async partial work begins', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        _id: TEST_WORKFLOW_ID,
        nodes: [{ id: 'node-1' }],
      } as never);
      vi.spyOn(service, 'patch').mockResolvedValue({} as never);
      mockWorkflowExecutionsService.createExecution.mockResolvedValue({
        _id: new Types.ObjectId(TEST_RUN_ID),
      });
      mockWorkflowExecutionsService.startExecution.mockResolvedValue({
        _id: TEST_RUN_ID,
        status: 'running',
      });
      const executePartialAsyncSpy = vi
        .spyOn(service as any, 'executePartialAsync')
        .mockResolvedValue(undefined);

      const result = await service.executePartial(
        TEST_WORKFLOW_ID,
        ['node-1'],
        TEST_USER_ID,
        TEST_ORG_ID,
      );

      expect(
        mockWorkflowExecutionsService.createExecution,
      ).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_ORG_ID,
        expect.objectContaining({
          inputValues: {},
          metadata: {
            executionMode: 'partial',
            selectedNodeIds: ['node-1'],
          },
          trigger: WorkflowExecutionTrigger.MANUAL,
          workflow: expect.any(Types.ObjectId),
        }),
      );
      expect(mockWorkflowExecutionsService.startExecution).toHaveBeenCalledWith(
        TEST_RUN_ID,
      );
      expect(executePartialAsyncSpy).toHaveBeenCalledWith(
        TEST_WORKFLOW_ID,
        TEST_RUN_ID,
        ['node-1'],
        {},
      );
      expect(result).toEqual({
        _id: TEST_RUN_ID,
        status: 'running',
      });
    });
  });

  describe('triggerViaWebhook', () => {
    it('routes node workflows through the workflow executor service', async () => {
      const workflow = {
        _id: new Types.ObjectId(TEST_WORKFLOW_ID),
        nodes: [{ id: 'node-1', type: 'ai-generate-image' }],
        organization: new Types.ObjectId(TEST_ORG_ID),
        user: new Types.ObjectId(TEST_USER_ID),
      };

      vi.spyOn(service, 'findByWebhookId').mockResolvedValue(workflow as never);
      mockWorkflowExecutorService.executeManualWorkflow.mockResolvedValue({
        executionId: TEST_RUN_ID,
        status: 'running',
      });

      const result = await service.triggerViaWebhook('wh_123', {
        topic: 'launch',
      });

      expect(mockWorkflowModel.updateOne).toHaveBeenCalled();
      expect(
        mockWorkflowExecutorService.executeManualWorkflow,
      ).toHaveBeenCalledWith(
        TEST_WORKFLOW_ID,
        TEST_USER_ID,
        TEST_ORG_ID,
        { topic: 'launch' },
        {
          triggerSource: 'webhook',
          webhookId: 'wh_123',
        },
        WorkflowExecutionTrigger.API,
      );
      expect(result).toEqual({
        runId: TEST_RUN_ID,
        status: 'running',
      });
    });
  });

  describe('regenerateWebhookSecret', () => {
    it('should regenerate webhook secret', async () => {
      const patchSpy = vi.spyOn(service, 'patch').mockResolvedValue({} as any);

      const result = await service.regenerateWebhookSecret(TEST_WORKFLOW_ID);

      expect(result.webhookSecret).toBeDefined();
      expect(result.webhookSecret).toMatch(/^whsec_/);
      expect(patchSpy).toHaveBeenCalledWith(TEST_WORKFLOW_ID, {
        webhookSecret: expect.any(String),
      });
    });
  });

  describe('deleteWebhook', () => {
    it('should delete webhook configuration', async () => {
      mockWorkflowModel.updateOne = vi.fn().mockResolvedValue({});

      await service.deleteWebhook(TEST_WORKFLOW_ID);

      expect(mockWorkflowModel.updateOne).toHaveBeenCalledWith(
        { _id: TEST_WORKFLOW_ID, isDeleted: false },
        expect.objectContaining({
          $set: { webhookAuthType: 'secret' },
          $unset: { webhookId: '', webhookSecret: '' },
        }),
      );
    });
  });

  describe('lockNodes', () => {
    it('should add nodes to locked list', async () => {
      const nodeIds = ['node-1', 'node-2'];

      const mockWorkflow = {
        _id: TEST_WORKFLOW_ID,
        lockedNodeIds: ['existing-node'],
      };

      vi.spyOn(service, 'findOne').mockResolvedValue(mockWorkflow as any);
      const patchSpy = vi.spyOn(service, 'patch').mockResolvedValue({} as any);

      await service.lockNodes(TEST_WORKFLOW_ID, nodeIds, TEST_ORG_ID);

      expect(patchSpy).toHaveBeenCalledWith(TEST_WORKFLOW_ID, {
        lockedNodeIds: ['existing-node', 'node-1', 'node-2'],
      });
    });

    it('should deduplicate locked nodes', async () => {
      const nodeIds = ['node-1', 'node-1'];

      const mockWorkflow = {
        _id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
      };

      vi.spyOn(service, 'findOne').mockResolvedValue(mockWorkflow as any);
      const patchSpy = vi.spyOn(service, 'patch').mockResolvedValue({} as any);

      await service.lockNodes(TEST_WORKFLOW_ID, nodeIds, TEST_ORG_ID);

      expect(patchSpy).toHaveBeenCalledWith(TEST_WORKFLOW_ID, {
        lockedNodeIds: ['node-1'],
      });
    });
  });

  describe('unlockNodes', () => {
    it('should remove nodes from locked list', async () => {
      const nodeIds = ['node-2'];

      const mockWorkflow = {
        _id: TEST_WORKFLOW_ID,
        lockedNodeIds: ['node-1', 'node-2', 'node-3'],
      };

      vi.spyOn(service, 'findOne').mockResolvedValue(mockWorkflow as any);
      const patchSpy = vi.spyOn(service, 'patch').mockResolvedValue({} as any);

      await service.unlockNodes(TEST_WORKFLOW_ID, nodeIds, TEST_ORG_ID);

      expect(patchSpy).toHaveBeenCalledWith(TEST_WORKFLOW_ID, {
        lockedNodeIds: ['node-1', 'node-3'],
      });
    });
  });

  describe('publishWorkflowLifecycle', () => {
    it('should update lifecycle to published', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        _id: TEST_WORKFLOW_ID,
      } as any);
      vi.spyOn(service, 'patch').mockResolvedValue({
        _id: TEST_WORKFLOW_ID,
        lifecycle: 'published',
      } as any);

      const result = await service.publishWorkflowLifecycle(
        TEST_WORKFLOW_ID,
        TEST_ORG_ID,
      );

      expect(result).toBeDefined();
    });
  });

  describe('archiveWorkflow', () => {
    it('should update lifecycle to archived', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        _id: TEST_WORKFLOW_ID,
      } as any);
      vi.spyOn(service, 'patch').mockResolvedValue({
        _id: TEST_WORKFLOW_ID,
        lifecycle: 'archived',
      } as any);

      const result = await service.archiveWorkflow(
        TEST_WORKFLOW_ID,
        TEST_ORG_ID,
      );

      expect(result).toBeDefined();
    });
  });

  describe('getExecutionLogs', () => {
    it('should return execution logs for a run', async () => {
      const mockExecution = {
        _id: { toString: () => TEST_RUN_ID },
        completedAt: new Date(),
        creditsUsed: 100,
        error: undefined,
        nodeResults: [],
        startedAt: new Date(),
        status: 'completed',
      };

      mockWorkflowExecutionsService.findOne.mockResolvedValue(mockExecution);

      const result = await service.getExecutionLogs(
        TEST_WORKFLOW_ID,
        TEST_RUN_ID,
        TEST_ORG_ID,
      );

      expect(result.runId).toBe(TEST_RUN_ID);
      expect(result.status).toBe('completed');
      expect(result.totalCreditsUsed).toBe(100);
      expect(mockWorkflowExecutionsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ _id: TEST_RUN_ID }),
      );
    });

    it('should throw error when run not found', async () => {
      mockWorkflowExecutionsService.findOne.mockResolvedValue(null);

      await expect(
        service.getExecutionLogs(TEST_WORKFLOW_ID, TEST_RUN_ID, TEST_ORG_ID),
      ).rejects.toThrow('Execution run');
    });
  });

  describe('getWorkflowStatistics', () => {
    it('should return aggregated workflow statistics', async () => {
      mockWorkflowModel.aggregate = vi.fn().mockResolvedValue([
        { _id: 'active', count: 5 },
        { _id: 'completed', count: 10 },
      ]);

      const result = await service.getWorkflowStatistics(
        TEST_USER_ID,
        TEST_ORG_ID,
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ _id: 'active', count: 5 });
    });
  });

  describe('cloneWorkflow', () => {
    it('should create a copy of the workflow', async () => {
      const mockWorkflow = {
        _id: TEST_WORKFLOW_ID,
        label: 'Original Workflow',
        status: 'completed',
        steps: [],
      };

      vi.spyOn(service, 'findOne').mockResolvedValue(mockWorkflow as any);
      vi.spyOn(service, 'create').mockResolvedValue({
        ...mockWorkflow,
        label: 'Original Workflow (Copy)',
        status: 'draft',
      } as any);

      const result = await service.cloneWorkflow(
        TEST_WORKFLOW_ID,
        TEST_USER_ID,
        TEST_ORG_ID,
      );

      expect(result).toBeDefined();
    });
  });

  describe('getWorkflowTemplates', () => {
    it('should return workflow templates', async () => {
      const result = await service.getWorkflowTemplates();

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
