import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type Brand,
  type Credential,
  type Workflow,
  type WorkflowExecution,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('DefaultRecurringContentService', () => {
  let service: DefaultRecurringContentService;
  let brandModel: Record<string, vi.Mock>;
  let workflowModel: Record<string, vi.Mock>;
  let workflowExecutionModel: Record<string, vi.Mock>;
  let credentialModel: Record<string, vi.Mock>;
  let workflowsService: Record<string, vi.Mock>;

  const brandId = 'test-object-id'.toString();
  const organizationId = 'test-object-id'.toString();
  const userId = 'test-object-id'.toString();

  const mockSortLean = <T>(value: T) => ({
    lean: vi.fn().mockResolvedValue(value),
    sort: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(value),
    }),
  });

  beforeEach(async () => {
    brandModel = {
      findOne: vi.fn(),
    };
    workflowModel = {
      find: vi.fn(),
    };
    workflowExecutionModel = {
      find: vi.fn(),
    };
    credentialModel = {
      findOne: vi.fn(),
    };
    workflowsService = {
      createWorkflow: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DefaultRecurringContentService,
        {
          provide: PrismaService,
          useValue: {
            ...brandModel,
            ...workflowModel,
            ...workflowExecutionModel,
            ...credentialModel,
          },
        },
        {
          provide: WorkflowsService,
          useValue: workflowsService,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(DefaultRecurringContentService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should report partial bundle status when only some recurring workflows exist', async () => {
    const postWorkflowId = 'test-object-id';
    const newsletterWorkflowId = 'test-object-id';

    workflowModel.find.mockReturnValue(
      mockSortLean([
        {
          _id: postWorkflowId,
          isScheduleEnabled: true,
          metadata: {
            defaultRecurringContent: { contentType: 'post' },
          },
          recurrence: { nextRunAt: new Date('2026-03-11T08:00:00.000Z') },
        },
        {
          _id: newsletterWorkflowId,
          isScheduleEnabled: true,
          metadata: {
            defaultRecurringContent: { contentType: 'newsletter' },
          },
        },
      ]),
    );
    workflowExecutionModel.find.mockReturnValue(
      mockSortLean([
        {
          _id: 'test-object-id',
          startedAt: new Date('2026-03-11T08:00:00.000Z'),
          status: 'pending',
          workflow: postWorkflowId,
        },
      ]),
    );

    const status = await service.getStatus(organizationId, brandId);

    expect(status.isConfigured).toBe(false);
    expect(status.items).toHaveLength(2);
    expect(status.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentType: 'post',
          workflowId: postWorkflowId.toString(),
        }),
        expect.objectContaining({
          contentType: 'newsletter',
          workflowId: newsletterWorkflowId.toString(),
        }),
      ]),
    );
  });

  it('should create only missing recurring workflows when ensuring the default bundle', async () => {
    const existingPostWorkflowId = 'test-object-id';
    const createdWorkflowIds = [
      'test-object-id'.toString(),
      'test-object-id'.toString(),
    ];

    brandModel.findOne.mockResolvedValue({
      _id: new string(brandId),
      agentConfig: { schedule: { timezone: 'Europe/Malta' } },
      label: 'Genfeed',
    });

    workflowModel.find
      .mockReturnValueOnce(
        mockSortLean([
          {
            _id: existingPostWorkflowId,
            isScheduleEnabled: true,
            metadata: {
              defaultRecurringContent: { contentType: 'post' },
            },
          },
        ]),
      )
      .mockReturnValueOnce(
        mockSortLean([
          {
            _id: existingPostWorkflowId,
            isScheduleEnabled: true,
            metadata: {
              defaultRecurringContent: { contentType: 'post' },
            },
          },
          {
            _id: new string(createdWorkflowIds[0]),
            isScheduleEnabled: true,
            metadata: {
              defaultRecurringContent: { contentType: 'newsletter' },
            },
          },
          {
            _id: new string(createdWorkflowIds[1]),
            isScheduleEnabled: true,
            metadata: {
              defaultRecurringContent: { contentType: 'image' },
            },
          },
        ]),
      );
    workflowExecutionModel.find
      .mockReturnValueOnce(mockSortLean([]))
      .mockReturnValueOnce(mockSortLean([]));
    credentialModel.findOne.mockResolvedValue({
      _id: 'test-object-id',
      platform: 'twitter',
    });
    workflowsService.createWorkflow
      .mockResolvedValueOnce({ _id: createdWorkflowIds[0] })
      .mockResolvedValueOnce({ _id: createdWorkflowIds[1] });
    const status = await service.ensureDefaultBundle({
      brandId,
      organizationId,
      origin: 'manual',
      userId,
    });

    expect(workflowsService.createWorkflow).toHaveBeenCalledTimes(2);
    expect(workflowsService.createWorkflow).toHaveBeenNthCalledWith(
      1,
      userId,
      organizationId,
      expect.objectContaining({
        label: 'Daily newsletter for Genfeed',
        nodes: [
          expect.objectContaining({
            type: 'ai-generate-newsletter',
          }),
        ],
      }),
    );
    expect(workflowsService.createWorkflow).toHaveBeenNthCalledWith(
      2,
      userId,
      organizationId,
      expect.objectContaining({
        label: 'Daily images for Genfeed',
        nodes: [
          expect.objectContaining({
            type: 'ai-generate-image',
          }),
        ],
      }),
    );
    expect(status.isConfigured).toBe(true);
    expect(status.items).toHaveLength(3);
  });
});
