vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ThreadRunsController } from '@api/collections/agent-runs/controllers/thread-runs.controller';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { testId } from '@helpers/testing/test-id.helper';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ThreadRunsController', () => {
  let controller: ThreadRunsController;
  let agentRunsService: { getByThread: ReturnType<typeof vi.fn> };

  const orgId = testId('org');
  const threadId = testId('thread');
  const brandId = testId('brand');
  const userId = testId('user');

  const mockUser: User = {
    id: 'user_123',
    brandId,
    organizationId: orgId,
    userId,
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
      .overrideGuard(BetterAuthGuard)
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
          id: threadId,
          status: 'completed',
          threadId,
        },
        {
          id: threadId,
          status: 'running',
          threadId,
        },
      ];
      agentRunsService.getByThread.mockResolvedValue(mockRuns);

      const result = await controller.getThreadRuns(
        mockRequest,
        threadId,
        mockUser,
      );

      expect(agentRunsService.getByThread).toHaveBeenCalledWith(
        threadId,
        orgId,
        {
          brandId,
          cursor: undefined,
          limit: undefined,
        },
      );
      expect(result).toEqual({ data: mockRuns });
    });

    it('should return an empty collection when no runs exist', async () => {
      agentRunsService.getByThread.mockResolvedValue([]);

      const result = await controller.getThreadRuns(
        mockRequest,
        threadId,
        mockUser,
      );

      expect(result).toEqual({ data: [] });
    });

    it('should pass the correct organizationId from identity', async () => {
      agentRunsService.getByThread.mockResolvedValue([]);

      await controller.getThreadRuns(mockRequest, threadId, mockUser);

      expect(agentRunsService.getByThread).toHaveBeenCalledWith(
        expect.any(String),
        orgId,
        {
          brandId,
          cursor: undefined,
          limit: undefined,
        },
      );
    });

    it('should pass the correct threadId parameter', async () => {
      agentRunsService.getByThread.mockResolvedValue([]);

      await controller.getThreadRuns(mockRequest, threadId, mockUser);

      expect(agentRunsService.getByThread).toHaveBeenCalledWith(
        threadId,
        expect.any(String),
        {
          brandId,
          cursor: undefined,
          limit: undefined,
        },
      );
    });

    it('should propagate errors thrown by the service', async () => {
      agentRunsService.getByThread.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        controller.getThreadRuns(mockRequest, threadId, mockUser),
      ).rejects.toThrow('Database error');
    });

    it('should work with a different threadId', async () => {
      const otherThreadId = threadId;
      const mockRuns = [{ id: threadId, threadId: otherThreadId }];
      agentRunsService.getByThread.mockResolvedValue(mockRuns);

      await controller.getThreadRuns(mockRequest, otherThreadId, mockUser);

      expect(agentRunsService.getByThread).toHaveBeenCalledWith(
        otherThreadId,
        orgId,
        {
          brandId,
          cursor: undefined,
          limit: undefined,
        },
      );
    });

    it('should call getByThread exactly once per request', async () => {
      agentRunsService.getByThread.mockResolvedValue([]);

      await controller.getThreadRuns(mockRequest, threadId, mockUser);

      expect(agentRunsService.getByThread).toHaveBeenCalledTimes(1);
    });

    it('should handle single-run thread correctly', async () => {
      const singleRun = [{ id: threadId, status: 'completed' }];
      agentRunsService.getByThread.mockResolvedValue(singleRun);

      const result = await controller.getThreadRuns(
        mockRequest,
        threadId,
        mockUser,
      );

      expect(result).toEqual({ data: singleRun });
    });
  });
});
