import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentRun } from '@api/collections/agent-runs/schemas/agent-run.schema';
import { AgentRoom } from '@api/collections/agent-threads/schemas/agent-thread.schema';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { AgentThreadSnapshot } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentExecutionStatus, AgentThreadStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('AgentThreadsService', () => {
  let service: AgentThreadsService;
  let mockModel: ReturnType<typeof createMockModel>;
  let mockSnapshotModel: {
    find: ReturnType<typeof vi.fn>;
  };
  let mockAgentRunModel: {
    find: ReturnType<typeof vi.fn>;
  };

  const mockConversation = {
    _id: 'test-object-id',
    organization: 'test-object-id',
    title: 'Test Thread',
    user: 'test-object-id'.toString(),
  };

  function createMockModel() {
    return Object.assign(
      vi.fn().mockImplementation((dto: Record<string, unknown>) => ({
        ...dto,
        save: vi.fn().mockResolvedValue({ ...mockConversation, ...dto }),
      })),
      {
        aggregate: vi.fn(),
        aggregatePaginate: vi.fn(),
        deleteMany: vi.fn(),
        find: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([mockConversation]),
            populate: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([mockConversation]),
            }),
          }),
        }),
        findById: vi.fn(),
        findByIdAndDelete: vi.fn(),
        findByIdAndUpdate: vi.fn(),
        findOne: vi.fn(),
        updateMany: vi.fn(),
      },
    );
  }

  beforeEach(async () => {
    mockModel = createMockModel();
    mockSnapshotModel = {
      find: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    };
    mockAgentRunModel = {
      find: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      }),
    };
    mockAgentRunModel.find().sort().lean.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentThreadsService,
        {
          provide: PrismaService,
          useValue: {
            ...mockModel,
            ...mockSnapshotModel,
            ...mockAgentRunModel,
          },
        },
        {
          provide: AgentMessagesService,
          useValue: {
            copyMessages: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentThreadsService>(AgentThreadsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserThreads', () => {
    it('should query with user filter and no status when status is not provided', async () => {
      const userId = 'test-object-id'.toString();
      const organizationId = 'test-object-id'.toString();

      const result = await service.getUserThreads(userId, organizationId);

      const query = mockModel.find.mock.calls[0][0];
      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
          organization: expect.any(string),
          user: expect.objectContaining({
            $in: [expect.any(string), userId],
          }),
        }),
      );
      // Should NOT have $or or status when no status filter
      expect(query).not.toHaveProperty('$or');
      expect(query).not.toHaveProperty('status');
      expect(result).toHaveLength(1);
    });

    it('should use $or filter for ACTIVE status to include threads missing status field', async () => {
      const userId = 'test-object-id'.toString();
      const organizationId = 'test-object-id'.toString();

      await service.getUserThreads(
        userId,
        organizationId,
        AgentThreadStatus.ACTIVE,
      );

      const query = mockModel.find.mock.calls[0][0];
      expect(query.$or).toEqual([
        { status: AgentThreadStatus.ACTIVE },
        { status: { $exists: false } },
      ]);
      expect(query).not.toHaveProperty('status');
    });

    it('should use direct status filter for non-ACTIVE statuses', async () => {
      const userId = 'test-object-id'.toString();
      const organizationId = 'test-object-id'.toString();

      await service.getUserThreads(
        userId,
        organizationId,
        AgentThreadStatus.ARCHIVED,
      );

      const query = mockModel.find.mock.calls[0][0];
      expect(query.status).toBe(AgentThreadStatus.ARCHIVED);
      expect(query).not.toHaveProperty('$or');
    });

    it('should merge snapshot-derived thread summary fields', async () => {
      const userId = 'test-object-id'.toString();
      const organizationId = 'test-object-id'.toString();
      const startedAt = '2026-03-11T09:00:00.000Z';
      const lastAssistantCreatedAt = '2026-03-11T09:05:00.000Z';

      mockSnapshotModel.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: 'test-object-id',
            activeRun: {
              startedAt,
              status: 'running',
            },
            isDeleted: false,
            lastAssistantMessage: {
              content: 'Latest assistant summary',
              createdAt: lastAssistantCreatedAt,
            },
            organization: new string(organizationId),
            pendingInputRequests: [{ requestId: 'request-1' }],
            thread: mockConversation._id,
          },
        ]),
      });

      const result = await service.getUserThreads(userId, organizationId);

      expect(result).toEqual([
        expect.objectContaining({
          attentionState: 'needs-input',
          lastActivityAt: lastAssistantCreatedAt,
          lastAssistantPreview: 'Latest assistant summary',
          pendingInputCount: 1,
          runStatus: 'waiting_input',
        }),
      ]);
      expect(mockSnapshotModel.find).toHaveBeenCalledWith({
        isDeleted: false,
        organization: expect.any(string),
        thread: { $in: [mockConversation._id] },
      });
    });

    it('should prefer the latest persisted run status when a snapshot is stuck running', async () => {
      const userId = 'test-object-id'.toString();
      const organizationId = 'test-object-id'.toString();

      mockSnapshotModel.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: 'test-object-id',
            activeRun: {
              startedAt: '2026-03-11T09:00:00.000Z',
              status: 'running',
            },
            isDeleted: false,
            organization: new string(organizationId),
            pendingInputRequests: [],
            thread: mockConversation._id,
          },
        ]),
      });
      mockAgentRunModel.find.mockReturnValue({
        lean: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      });
      mockAgentRunModel
        .find()
        .sort()
        .lean.mockResolvedValue([
          {
            _id: 'test-object-id',
            status: AgentExecutionStatus.COMPLETED,
            thread: mockConversation._id,
          },
        ]);

      const result = await service.getUserThreads(userId, organizationId);

      expect(result).toEqual([
        expect.objectContaining({
          attentionState: null,
          pendingInputCount: 0,
          runStatus: 'completed',
        }),
      ]);
    });

    it('treats an awaiting-approval plan as attention needed', async () => {
      const userId = 'test-object-id'.toString();
      const organizationId = 'test-object-id'.toString();

      mockSnapshotModel.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: 'test-object-id',
            isDeleted: false,
            organization: new string(organizationId),
            pendingInputRequests: [{ id: 'request-1' }],
            thread: mockConversation._id,
          },
        ]),
      });

      const result = await service.getUserThreads(userId, organizationId);

      expect(result).toEqual([
        expect.objectContaining({
          attentionState: 'needs-input',
          pendingInputCount: 1,
          runStatus: 'waiting_input',
        }),
      ]);
    });

    it('should throw for invalid user id', () => {
      expect(() =>
        service.getUserThreads('not-a-mongo-id', 'test-object-id'.toString()),
      ).toThrow(BadRequestException);
    });
  });

  describe('archiveAllThreads', () => {
    it('archives only the current user active threads in the organization', async () => {
      const userId = 'test-object-id'.toString();
      const organizationId = 'test-object-id'.toString();
      const updateMany = vi
        .spyOn(mockModel, 'updateMany')
        .mockResolvedValue({ modifiedCount: 3 } as never);

      await expect(
        service.archiveAllThreads(userId, organizationId),
      ).resolves.toBe(3);

      expect(updateMany).toHaveBeenCalledWith(
        {
          $or: [
            { status: AgentThreadStatus.ACTIVE },
            { status: { $exists: false } },
          ],
          isDeleted: false,
          organization: expect.any(string),
          user: expect.objectContaining({
            $in: [expect.any(string), userId],
          }),
        },
        { $set: { status: AgentThreadStatus.ARCHIVED } },
      );
    });
  });
});
