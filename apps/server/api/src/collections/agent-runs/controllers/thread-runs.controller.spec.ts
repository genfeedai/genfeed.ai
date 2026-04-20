vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { ThreadRunsController } from '@api/collections/agent-runs/controllers/thread-runs.controller';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ThreadRunsController', () => {
  let controller: ThreadRunsController;
  let agentRunsService: { getByThread: ReturnType<typeof vi.fn> };

  const orgId = '507f1f77bcf86cd799439012';
  const threadId = '507f191e810c19729de860ee'.toString();

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: orgId,
      user: '507f1f77bcf86cd799439014',
    },
  };

  const mockRequest = {
    originalUrl: `/api/threads/${threadId}/runs`,
    query: {},
  } as Request;

  beforeEach(async () => {
    agentRunsService = {
      getByThread: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ThreadRunsController],
      providers: [{ provide: AgentRunsService, useValue: agentRunsService }],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ThreadRunsController>(ThreadRunsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getThreadRuns', () => {
    it('should return serialized runs for the given thread', async () => {
      const mockRuns = [
        {
          _id: '507f191e810c19729de860ee',
          status: 'completed',
          thread: threadId,
        },
        {
          _id: '507f191e810c19729de860ee',
          status: 'running',
          thread: threadId,
        },
      ];
      agentRunsService.getByThread.mockResolvedValue(mockRuns);

      const result = await controller.getThreadRuns(
        mockRequest,
        threadId,
        mockUser as any,
      );

      expect(agentRunsService.getByThread).toHaveBeenCalledWith(
        threadId,
        orgId,
      );
      expect(result).toEqual({ data: mockRuns });
    });

    it('should return an empty collection when no runs exist', async () => {
      agentRunsService.getByThread.mockResolvedValue([]);

      const result = await controller.getThreadRuns(
        mockRequest,
        threadId,
        mockUser as any,
      );

      expect(result).toEqual({ data: [] });
    });

    it('should pass the correct organizationId from publicMetadata', async () => {
      agentRunsService.getByThread.mockResolvedValue([]);

      await controller.getThreadRuns(mockRequest, threadId, mockUser as any);

      expect(agentRunsService.getByThread).toHaveBeenCalledWith(
        expect.any(String),
        orgId,
      );
    });

    it('should pass the correct threadId parameter', async () => {
      agentRunsService.getByThread.mockResolvedValue([]);

      await controller.getThreadRuns(mockRequest, threadId, mockUser as any);

      expect(agentRunsService.getByThread).toHaveBeenCalledWith(
        threadId,
        expect.any(String),
      );
    });

    it('should propagate errors thrown by the service', async () => {
      agentRunsService.getByThread.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        controller.getThreadRuns(mockRequest, threadId, mockUser as any),
      ).rejects.toThrow('Database error');
    });

    it('should work with a different threadId', async () => {
      const otherThreadId = '507f191e810c19729de860ee'.toString();
      const mockRuns = [
        { _id: '507f191e810c19729de860ee', thread: otherThreadId },
      ];
      agentRunsService.getByThread.mockResolvedValue(mockRuns);

      await controller.getThreadRuns(
        mockRequest,
        otherThreadId,
        mockUser as any,
      );

      expect(agentRunsService.getByThread).toHaveBeenCalledWith(
        otherThreadId,
        orgId,
      );
    });

    it('should call getByThread exactly once per request', async () => {
      agentRunsService.getByThread.mockResolvedValue([]);

      await controller.getThreadRuns(mockRequest, threadId, mockUser as any);

      expect(agentRunsService.getByThread).toHaveBeenCalledTimes(1);
    });

    it('should handle single-run thread correctly', async () => {
      const singleRun = [
        { _id: '507f191e810c19729de860ee', status: 'completed' },
      ];
      agentRunsService.getByThread.mockResolvedValue(singleRun);

      const result = await controller.getThreadRuns(
        mockRequest,
        threadId,
        mockUser as any,
      );

      expect(result).toEqual({ data: singleRun });
    });
  });
});
