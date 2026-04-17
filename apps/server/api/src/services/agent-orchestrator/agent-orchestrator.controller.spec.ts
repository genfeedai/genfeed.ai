import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AgentOrchestratorController } from '@api/services/agent-orchestrator/agent-orchestrator.controller';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: 'test-object-id',
    user: 'test-object-id',
  })),
}));
vi.mock('@api/helpers/utils/error-response/error-response.util', () => ({
  ErrorResponse: {
    handle: vi.fn((e: unknown) => {
      throw e;
    }),
  },
}));

describe('AgentOrchestratorController', () => {
  let controller: AgentOrchestratorController;
  let service: {
    chat: ReturnType<typeof vi.fn>;
    chatStream: ReturnType<typeof vi.fn>;
  };
  let agentGoalsService: {
    create: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    refreshProgress: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let usersService: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    service = {
      chat: vi.fn(),
      chatStream: vi.fn(),
    };
    agentGoalsService = {
      create: vi.fn(),
      list: vi.fn(),
      refreshProgress: vi.fn(),
      update: vi.fn(),
    };
    usersService = {
      findOne: vi.fn(),
    };
    const creditsService = {
      getOrganizationCreditsBalance: vi.fn(),
    };
    const loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    controller = new AgentOrchestratorController(
      service as unknown as AgentOrchestratorService,
      creditsService as unknown as CreditsUtilsService,
      agentGoalsService as unknown as AgentGoalsService,
      usersService as unknown as UsersService,
      loggerService as unknown as LoggerService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('chat', () => {
    it('should call orchestrator service with correct params', async () => {
      const user = {
        id: 'clerk_123',
        publicMetadata: { organization: 'org', user: 'usr' },
      } as unknown as User;
      usersService.findOne.mockResolvedValue({
        _id: 'test-object-id',
      });
      service.chat.mockResolvedValue({} as never);
      const body = {
        content: 'hello',
        source: 'onboarding',
        threadId: 'conv-1',
      };

      await controller.chat(body, user, 'Bearer token123');

      expect(service.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'hello',
          source: 'onboarding',
        }),
        expect.objectContaining({
          authToken: 'token123',
          userId: expect.any(String),
        }),
      );
    });

    it('should strip Bearer prefix from auth header', async () => {
      const user = {
        id: 'clerk_456',
        publicMetadata: { organization: 'org', user: 'usr' },
      } as unknown as User;
      usersService.findOne.mockResolvedValue({
        _id: 'test-object-id',
      });
      service.chat.mockResolvedValue({} as never);

      await controller.chat(
        { content: 'hi', source: 'onboarding', threadId: 'c1' },
        user,
        'Bearer mytoken',
      );

      expect(service.chat).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ authToken: 'mytoken' }),
      );
    });

    it('should resolve user from usersService before calling chat', async () => {
      const userId = 'test-object-id';
      const user = {
        id: 'clerk_789',
        publicMetadata: { organization: 'org', user: 'usr' },
      } as unknown as User;
      usersService.findOne.mockResolvedValue({ _id: userId });
      service.chat.mockResolvedValue({} as never);

      await controller.chat(
        { content: 'x', source: 'chat', threadId: 'c2' },
        user,
        'Bearer t',
      );

      expect(usersService.findOne).toHaveBeenCalled();
      expect(service.chat).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ userId }),
      );
    });

    it('should pass threadId through to service', async () => {
      const user = {
        id: 'clerk_000',
        publicMetadata: { organization: 'org', user: 'usr' },
      } as unknown as User;
      usersService.findOne.mockResolvedValue({
        _id: 'test-object-id',
      });
      service.chat.mockResolvedValue({} as never);

      await controller.chat(
        { content: 'test', source: 'chat', threadId: 'conv-unique' },
        user,
        'Bearer t',
      );

      expect(service.chat).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'conv-unique' }),
        expect.any(Object),
      );
    });
  });

  describe('chatStream', () => {
    it('should return threadId from the streaming chat response', async () => {
      const user = {
        id: 'clerk_222',
        publicMetadata: { organization: 'org', user: 'usr' },
      } as unknown as User;
      usersService.findOne.mockResolvedValue({
        _id: 'test-object-id',
      });
      service.chatStream.mockResolvedValue({
        runId: 'run-1',
        startedAt: '2026-03-12T00:00:00.000Z',
        threadId: 'thread-stream',
      } as never);

      const result = await controller.chatStream(
        { content: 'stream', source: 'chat', threadId: 'thread-stream' },
        user,
        'Bearer token123',
      );

      expect(service.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'thread-stream' }),
        expect.any(Object),
      );
      expect(result).toMatchObject({
        threadId: 'thread-stream',
      });
    });
  });

  describe('goals', () => {
    it('should list goals for the current organization', async () => {
      const user = { id: 'clerk_123' } as unknown as User;
      agentGoalsService.list.mockResolvedValue([{ _id: 'goal-1' }]);

      const result = await controller.listGoals(user, 'brand-1');

      expect(agentGoalsService.list).toHaveBeenCalledWith(
        expect.any(String),
        'brand-1',
      );
      expect(result).toEqual([{ _id: 'goal-1' }]);
    });

    it('should create a goal for the current user and org', async () => {
      const user = { id: 'clerk_123' } as unknown as User;
      usersService.findOne.mockResolvedValue({
        _id: 'test-object-id',
      });
      agentGoalsService.create.mockResolvedValue({ _id: 'goal-1' });

      const result = await controller.createGoal(
        {
          label: 'Grow views',
          metric: 'views',
          targetValue: 1000,
        },
        user,
      );

      expect(agentGoalsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Grow views',
          metric: 'views',
          targetValue: 1000,
        }),
        expect.any(String),
        expect.any(String),
      );
      expect(result).toEqual({ _id: 'goal-1' });
    });

    it('should refresh a goal by id', async () => {
      const user = { id: 'clerk_123' } as unknown as User;
      agentGoalsService.refreshProgress.mockResolvedValue({
        _id: 'goal-1',
        progressPercent: 25,
      });

      const result = await controller.getGoal('goal-1', user);

      expect(agentGoalsService.refreshProgress).toHaveBeenCalledWith(
        'goal-1',
        expect.any(String),
      );
      expect(result).toEqual({ _id: 'goal-1', progressPercent: 25 });
    });

    it('should update a goal by id', async () => {
      const user = { id: 'clerk_123' } as unknown as User;
      agentGoalsService.update.mockResolvedValue({
        _id: 'goal-1',
        targetValue: 2000,
      });

      const result = await controller.updateGoal(
        'goal-1',
        { targetValue: 2000 },
        user,
      );

      expect(agentGoalsService.update).toHaveBeenCalledWith(
        'goal-1',
        { targetValue: 2000 },
        expect.any(String),
      );
      expect(result).toEqual({ _id: 'goal-1', targetValue: 2000 });
    });
  });
});
