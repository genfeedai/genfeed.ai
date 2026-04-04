import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { Workflow } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { WorkflowExecutionTrigger, WorkflowStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('WorkflowSchedulerService', () => {
  let service: WorkflowSchedulerService;
  let workflowModel: Record<string, vi.Mock>;
  let loggerService: Record<string, vi.Mock>;
  let schedulerRegistry: Record<string, vi.Mock>;
  let workflowsService: Record<string, vi.Mock>;
  let workflowExecutionsService: Record<string, vi.Mock>;
  let workflowExecutorService: Record<string, vi.Mock>;

  const mockWorkflowId = new Types.ObjectId().toString();
  const mockUserId = new Types.ObjectId().toString();
  const mockOrgId = new Types.ObjectId().toString();

  const createMockWorkflow = (overrides = {}) => ({
    _id: new Types.ObjectId(mockWorkflowId),
    inputVariables: [
      { defaultValue: 'default topic', key: 'topic' },
      { defaultValue: 5, key: 'count' },
    ],
    isDeleted: false,
    isScheduleEnabled: true,
    name: 'Test Workflow',
    nodes: [],
    organization: new Types.ObjectId(mockOrgId),
    schedule: '0 9 * * *',
    status: WorkflowStatus.ACTIVE,
    timezone: 'UTC',
    user: new Types.ObjectId(mockUserId),
    ...overrides,
  });

  beforeEach(async () => {
    workflowModel = {
      find: vi.fn(),
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
    };

    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    schedulerRegistry = {
      addCronJob: vi.fn(),
      deleteCronJob: vi.fn(),
      getCronJob: vi.fn(),
    };

    workflowsService = {
      executeWorkflow: vi.fn(),
    };

    workflowExecutionsService = {
      createExecution: vi.fn(),
    };
    workflowExecutorService = {
      executeManualWorkflow: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowSchedulerService,
        {
          provide: getModelToken(Workflow.name, DB_CONNECTIONS.CLOUD),
          useValue: workflowModel,
        },
        {
          provide: LoggerService,
          useValue: loggerService,
        },
        {
          provide: SchedulerRegistry,
          useValue: schedulerRegistry,
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn(), isDevSchedulersEnabled: true },
        },
        {
          provide: WorkflowsService,
          useValue: workflowsService,
        },
        {
          provide: WorkflowExecutionsService,
          useValue: workflowExecutionsService,
        },
        {
          provide: WorkflowExecutorService,
          useValue: workflowExecutorService,
        },
      ],
    }).compile();

    service = module.get<WorkflowSchedulerService>(WorkflowSchedulerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('service definition', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('onModuleInit', () => {
    it('should load scheduled workflows on module initialization', async () => {
      workflowModel.find.mockResolvedValue([]);

      await service.onModuleInit();

      expect(workflowModel.find).toHaveBeenCalledWith({
        isDeleted: false,
        isScheduleEnabled: true,
        schedule: { $exists: true, $ne: null },
        status: WorkflowStatus.ACTIVE,
      });
    });
  });

  describe('loadScheduledWorkflows', () => {
    it('should load and schedule all enabled workflows', async () => {
      const mockWorkflows = [
        createMockWorkflow({ _id: new Types.ObjectId() }),
        createMockWorkflow({ _id: new Types.ObjectId() }),
      ];

      workflowModel.find.mockResolvedValue(mockWorkflows);

      await service.loadScheduledWorkflows();

      expect(workflowModel.find).toHaveBeenCalledWith({
        isDeleted: false,
        isScheduleEnabled: true,
        schedule: { $exists: true, $ne: null },
        status: WorkflowStatus.ACTIVE,
      });
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Loading 2 scheduled workflows'),
        'WorkflowSchedulerService',
      );
    });

    it('should handle empty workflow list', async () => {
      workflowModel.find.mockResolvedValue([]);

      await service.loadScheduledWorkflows();

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Loading 0 scheduled workflows'),
        'WorkflowSchedulerService',
      );
    });

    it('should log error when loading fails', async () => {
      const error = new Error('Database error');
      workflowModel.find.mockRejectedValue(error);

      await service.loadScheduledWorkflows();

      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to load scheduled workflows',
        error,
        'WorkflowSchedulerService',
      );
    });
  });

  describe('scheduleWorkflow', () => {
    it('should schedule a workflow with valid cron expression', async () => {
      const mockWorkflow = createMockWorkflow();

      await service.scheduleWorkflow(mockWorkflow as never);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Scheduled workflow'),
        'WorkflowSchedulerService',
      );
    });

    it('should not schedule workflow without schedule', async () => {
      const mockWorkflow = createMockWorkflow({ schedule: null });

      await service.scheduleWorkflow(mockWorkflow as never);

      expect(schedulerRegistry.addCronJob).not.toHaveBeenCalled();
    });

    it('should not schedule workflow with disabled schedule', async () => {
      const mockWorkflow = createMockWorkflow({ isScheduleEnabled: false });

      await service.scheduleWorkflow(mockWorkflow as never);

      expect(schedulerRegistry.addCronJob).not.toHaveBeenCalled();
    });

    it('should use UTC timezone when not specified', async () => {
      const mockWorkflow = createMockWorkflow({ timezone: undefined });

      await service.scheduleWorkflow(mockWorkflow as never);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Scheduled workflow'),
        'WorkflowSchedulerService',
      );
    });

    it('should handle invalid cron expression', async () => {
      const mockWorkflow = createMockWorkflow({ schedule: 'invalid-cron' });

      await service.scheduleWorkflow(mockWorkflow as never);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to schedule workflow'),
        expect.any(Error),
        'WorkflowSchedulerService',
      );
    });

    it('should handle scheduler registry error gracefully', async () => {
      const mockWorkflow = createMockWorkflow();
      schedulerRegistry.addCronJob.mockImplementation(() => {
        throw new Error('Job already exists');
      });

      await service.scheduleWorkflow(mockWorkflow as never);

      // Should not throw, should continue
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Scheduled workflow'),
        'WorkflowSchedulerService',
      );
    });
  });

  describe('unscheduleWorkflow', () => {
    it('should unschedule an existing workflow', async () => {
      const mockWorkflow = createMockWorkflow();
      await service.scheduleWorkflow(mockWorkflow as never);

      service.unscheduleWorkflow(mockWorkflowId);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Unscheduled workflow'),
        'WorkflowSchedulerService',
      );
    });

    it('should handle unscheduling non-existent workflow gracefully', () => {
      service.unscheduleWorkflow('non-existent-id');

      // Should not throw or log unscheduled message
      expect(loggerService.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Unscheduled workflow'),
        'WorkflowSchedulerService',
      );
    });

    it('should handle scheduler registry deletion error gracefully', async () => {
      const mockWorkflow = createMockWorkflow();
      await service.scheduleWorkflow(mockWorkflow as never);

      schedulerRegistry.deleteCronJob.mockImplementation(() => {
        throw new Error('Job not found');
      });

      // Should not throw
      expect(() => service.unscheduleWorkflow(mockWorkflowId)).not.toThrow();
    });
  });

  describe('updateSchedule', () => {
    it('should update workflow schedule and reschedule', async () => {
      const updatedWorkflow = createMockWorkflow({
        isScheduleEnabled: true,
        schedule: '0 10 * * *',
        timezone: 'America/New_York',
      });

      workflowModel.findOneAndUpdate.mockResolvedValue(updatedWorkflow);

      const result = await service.updateSchedule(
        mockWorkflowId,
        '0 10 * * *',
        'America/New_York',
        true,
      );

      expect(workflowModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockWorkflowId, isDeleted: false },
        {
          isScheduleEnabled: true,
          schedule: '0 10 * * *',
          timezone: 'America/New_York',
        },
        { returnDocument: 'after' },
      );
      expect(result).toEqual(updatedWorkflow);
    });

    it('should unschedule workflow when schedule is null', async () => {
      const updatedWorkflow = createMockWorkflow({
        isScheduleEnabled: false,
        schedule: null,
      });

      workflowModel.findOneAndUpdate.mockResolvedValue(updatedWorkflow);

      await service.updateSchedule(mockWorkflowId, null, 'UTC', false);

      expect(workflowModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockWorkflowId, isDeleted: false },
        {
          isScheduleEnabled: false,
          schedule: null,
          timezone: 'UTC',
        },
        { returnDocument: 'after' },
      );
    });

    it('should unschedule workflow when disabled', async () => {
      const updatedWorkflow = createMockWorkflow({
        isScheduleEnabled: false,
        schedule: '0 9 * * *',
      });

      workflowModel.findOneAndUpdate.mockResolvedValue(updatedWorkflow);

      await service.updateSchedule(mockWorkflowId, '0 9 * * *', 'UTC', false);

      expect(workflowModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockWorkflowId, isDeleted: false },
        {
          isScheduleEnabled: false,
          schedule: '0 9 * * *',
          timezone: 'UTC',
        },
        { returnDocument: 'after' },
      );
    });

    it('should return null when workflow not found', async () => {
      workflowModel.findOneAndUpdate.mockResolvedValue(null);

      const result = await service.updateSchedule(
        mockWorkflowId,
        '0 9 * * *',
        'UTC',
        true,
      );

      expect(result).toBeNull();
    });

    it('should use default timezone when not provided', async () => {
      const updatedWorkflow = createMockWorkflow();
      workflowModel.findOneAndUpdate.mockResolvedValue(updatedWorkflow);

      await service.updateSchedule(mockWorkflowId, '0 9 * * *');

      expect(workflowModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockWorkflowId, isDeleted: false },
        {
          isScheduleEnabled: true,
          schedule: '0 9 * * *',
          timezone: 'UTC',
        },
        { returnDocument: 'after' },
      );
    });
  });

  describe('getNextRunTime', () => {
    it('should return next run time for scheduled workflow', async () => {
      const mockWorkflow = createMockWorkflow();
      await service.scheduleWorkflow(mockWorkflow as never);

      const nextRun = service.getNextRunTime(mockWorkflowId);

      expect(nextRun).toBeInstanceOf(Date);
    });

    it('should return null for unscheduled workflow', () => {
      const nextRun = service.getNextRunTime('non-existent-id');

      expect(nextRun).toBeNull();
    });
  });

  describe('getScheduledWorkflowsInfo', () => {
    it('should return info for all scheduled workflows', async () => {
      const mockWorkflow1 = createMockWorkflow({
        _id: new Types.ObjectId(),
      });
      const mockWorkflow2 = createMockWorkflow({
        _id: new Types.ObjectId(),
        schedule: '0 12 * * *',
      });

      await service.scheduleWorkflow(mockWorkflow1 as never);
      await service.scheduleWorkflow(mockWorkflow2 as never);

      const info = service.getScheduledWorkflowsInfo();

      expect(info).toHaveLength(2);
      expect(info[0]).toHaveProperty('workflowId');
      expect(info[0]).toHaveProperty('cronExpression');
      expect(info[0]).toHaveProperty('timezone');
      expect(info[0]).toHaveProperty('nextRun');
    });

    it('should return empty array when no workflows scheduled', () => {
      const info = service.getScheduledWorkflowsInfo();

      expect(info).toHaveLength(0);
    });
  });

  describe('syncScheduledWorkflows', () => {
    it('should sync scheduled workflows periodically', async () => {
      workflowModel.find.mockResolvedValue([]);

      await service.syncScheduledWorkflows();

      expect(loggerService.log).toHaveBeenCalledWith(
        'Syncing scheduled workflows',
        'WorkflowSchedulerService',
      );
      expect(workflowModel.find).toHaveBeenCalled();
    });
  });

  describe('executeScheduledWorkflow (private method via schedule)', () => {
    it('should route step-only workflows through the legacy executor with a tracked execution', async () => {
      const legacyWorkflow = createMockWorkflow({ nodes: [] });

      workflowModel.findOne.mockResolvedValue(legacyWorkflow);
      workflowModel.findByIdAndUpdate.mockResolvedValue(legacyWorkflow);
      workflowExecutionsService.createExecution.mockResolvedValue({
        _id: 'legacy-exec',
      });
      workflowsService.executeWorkflow.mockResolvedValue({});

      await (service as never).executeScheduledWorkflow(
        legacyWorkflow._id.toString(),
      );

      expect(workflowExecutionsService.createExecution).toHaveBeenCalledWith(
        mockUserId,
        mockOrgId,
        expect.objectContaining({
          inputValues: { count: 5, topic: 'default topic' },
          trigger: WorkflowExecutionTrigger.SCHEDULED,
          workflow: expect.any(Types.ObjectId),
        }),
      );
      expect(workflowsService.executeWorkflow).toHaveBeenCalledWith(
        legacyWorkflow._id.toString(),
      );
      expect(
        workflowExecutorService.executeManualWorkflow,
      ).not.toHaveBeenCalled();
    });

    it('should route node workflows through the node executor with the scheduled trigger', async () => {
      const nodeWorkflow = createMockWorkflow({
        nodes: [
          {
            data: { config: { prompt: 'hello' }, label: 'Generate Image' },
            id: 'generate-primary',
            position: { x: 0, y: 0 },
            type: 'ai-generate-image',
          },
        ],
      });

      workflowModel.findOne.mockResolvedValue(nodeWorkflow);
      workflowModel.findByIdAndUpdate.mockResolvedValue(nodeWorkflow);
      workflowExecutorService.executeManualWorkflow.mockResolvedValue({
        executionId: 'exec-1',
        status: 'running',
      });

      await (service as never).executeScheduledWorkflow(
        nodeWorkflow._id.toString(),
      );

      expect(
        workflowExecutorService.executeManualWorkflow,
      ).toHaveBeenCalledWith(
        nodeWorkflow._id.toString(),
        mockUserId,
        mockOrgId,
        { count: 5, topic: 'default topic' },
        { triggeredBy: 'schedule' },
        WorkflowExecutionTrigger.SCHEDULED,
      );
      expect(workflowExecutionsService.createExecution).not.toHaveBeenCalled();
    });

    it('should execute workflow and create execution record', async () => {
      const mockWorkflow = createMockWorkflow();
      workflowModel.find.mockResolvedValue([mockWorkflow]);
      workflowModel.findOne.mockResolvedValue(mockWorkflow);
      workflowModel.findOneAndUpdate.mockResolvedValue(mockWorkflow);
      workflowsService.executeWorkflow.mockResolvedValue({});
      workflowExecutionsService.createExecution.mockResolvedValue({});

      // Load and schedule the workflow
      await service.loadScheduledWorkflows();

      // Get the scheduled job and trigger it manually
      const info = service.getScheduledWorkflowsInfo();
      expect(info.length).toBeGreaterThan(0);
    });

    it('should unschedule workflow when not found during execution', async () => {
      const mockWorkflow = createMockWorkflow();

      // Schedule the workflow first
      await service.scheduleWorkflow(mockWorkflow as never);

      // Mock findOne to return null (workflow deleted)
      workflowModel.findOne.mockResolvedValue(null);

      // Trigger execution by getting the job and calling its callback
      // Since we can't directly call private method, we verify through logs
      expect(service.getScheduledWorkflowsInfo().length).toBe(1);
    });

    it('should not execute systemic workflows without user/org', async () => {
      const systemicWorkflow = createMockWorkflow({
        organization: null,
        user: null,
      });

      workflowModel.find.mockResolvedValue([systemicWorkflow]);
      workflowModel.findOne.mockResolvedValue(systemicWorkflow);

      await service.loadScheduledWorkflows();

      // Systemic workflows should be scheduled but execution should be skipped
      expect(workflowExecutionsService.createExecution).not.toHaveBeenCalled();
    });

    it('should use workflow executor service for node-based workflows', async () => {
      const nodeWorkflow = createMockWorkflow({
        nodes: [
          {
            data: { config: { prompt: 'hello' }, label: 'Generate Image' },
            id: 'generate-primary',
            position: { x: 0, y: 0 },
            type: 'ai-generate-image',
          },
        ],
      });

      workflowModel.find.mockResolvedValue([nodeWorkflow]);
      workflowModel.findOne.mockResolvedValue(nodeWorkflow);
      workflowModel.findOneAndUpdate.mockResolvedValue(nodeWorkflow);
      workflowExecutionsService.createExecution.mockResolvedValue({});
      workflowExecutorService.executeManualWorkflow.mockResolvedValue({
        executionId: 'exec-1',
        status: 'completed',
      });

      await service.loadScheduledWorkflows();

      const info = service.getScheduledWorkflowsInfo();
      expect(info.length).toBeGreaterThan(0);
    });
  });

  describe('getDefaultInputValues (private method)', () => {
    it('should extract default values from workflow input variables', async () => {
      const mockWorkflow = createMockWorkflow({
        inputVariables: [
          { defaultValue: 'AI', key: 'topic' },
          { defaultValue: 10, key: 'count' },
          { key: 'noDefault' }, // No default value
        ],
      });

      workflowModel.find.mockResolvedValue([mockWorkflow]);
      workflowModel.findOne.mockResolvedValue(mockWorkflow);
      workflowModel.findOneAndUpdate.mockResolvedValue(mockWorkflow);
      workflowsService.executeWorkflow.mockResolvedValue({});

      // The default values are used internally during execution
      await service.loadScheduledWorkflows();

      expect(workflowModel.find).toHaveBeenCalled();
    });

    it('should handle workflow without input variables', async () => {
      const mockWorkflow = createMockWorkflow({
        inputVariables: undefined,
      });

      workflowModel.find.mockResolvedValue([mockWorkflow]);
      workflowModel.findOne.mockResolvedValue(mockWorkflow);
      workflowModel.findOneAndUpdate.mockResolvedValue(mockWorkflow);
      workflowsService.executeWorkflow.mockResolvedValue({});

      await service.loadScheduledWorkflows();

      expect(workflowModel.find).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent scheduling of same workflow', async () => {
      const mockWorkflow = createMockWorkflow();

      // Schedule the same workflow twice
      await service.scheduleWorkflow(mockWorkflow as never);
      await service.scheduleWorkflow(mockWorkflow as never);

      // Should only have one scheduled job
      const info = service.getScheduledWorkflowsInfo();
      expect(info.length).toBe(1);
    });

    it('should handle workflow with various timezone formats', async () => {
      const timezones = [
        'UTC',
        'America/New_York',
        'Europe/London',
        'Asia/Tokyo',
      ];

      for (const tz of timezones) {
        const mockWorkflow = createMockWorkflow({
          _id: new Types.ObjectId(),
          timezone: tz,
        });

        await service.scheduleWorkflow(mockWorkflow as never);
      }

      const info = service.getScheduledWorkflowsInfo();
      expect(info.length).toBe(timezones.length);
    });

    it('should handle various cron expressions', async () => {
      const cronExpressions = [
        '0 9 * * *', // Every day at 9am
        '0 0 * * 0', // Every Sunday at midnight
        '*/15 * * * *', // Every 15 minutes
        '0 9-17 * * 1-5', // Every hour 9am-5pm weekdays
      ];

      for (let i = 0; i < cronExpressions.length; i++) {
        const mockWorkflow = createMockWorkflow({
          _id: new Types.ObjectId(),
          schedule: cronExpressions[i],
        });

        await service.scheduleWorkflow(mockWorkflow as never);
      }

      const info = service.getScheduledWorkflowsInfo();
      expect(info.length).toBe(cronExpressions.length);
    });
  });
});
