import { UsersService } from '@api/collections/users/services/users.service';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AgentThreadsController } from '@api/services/agent-threading/controllers/agent-threads.controller';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Effect } from 'effect';

vi.mock('@api/helpers/utils/error-response/error-response.util', () => ({
  ErrorResponse: {
    handle: vi.fn((error: unknown) => {
      throw error;
    }),
  },
}));

describe('Threading AgentThreadsController', () => {
  const organizationId = '507f191e810c19729de860ea';
  const userId = '507f191e810c19729de860eb';
  const threadId = '507f191e810c19729de860ec';
  const mockUser = {
    id: 'clerk_123',
    publicMetadata: {
      organization: organizationId,
      user: userId,
    },
  } as unknown as User;

  let controller: AgentThreadsController;
  let usersService: { findOne: ReturnType<typeof vi.fn> };
  let agentOrchestratorService: {
    handleThreadUiAction: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    usersService = {
      findOne: vi.fn().mockResolvedValue({ _id: userId }),
    };
    agentOrchestratorService = {
      handleThreadUiAction: vi.fn(),
    };

    controller = new AgentThreadsController(
      {
        getSnapshot: vi.fn(),
        getSnapshotEffect: vi.fn(() =>
          Effect.succeed({
            lastSequence: 0,
            memorySummaryRefs: [],
            pendingApprovals: [],
            pendingInputRequests: [],
            timeline: [],
          }),
        ),
        listEvents: vi.fn(),
        listEventsEffect: vi.fn(() => Effect.succeed([])),
        recordMemoryFlushEffect: vi.fn(() => Effect.void),
        resolveInputRequest: vi.fn(),
        resolveInputRequestEffect: vi.fn(() =>
          Effect.succeed({
            requestId: 'req-1',
            status: 'resolved',
          }),
        ),
      } as never as AgentThreadEngineService,
      {} as never,
      {} as never,
      usersService as never as UsersService,
      agentOrchestratorService as never as AgentOrchestratorService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as never as LoggerService,
    );
  });

  it('routes thread UI actions with resolved tenant context', async () => {
    agentOrchestratorService.handleThreadUiAction.mockResolvedValue({
      creditsRemaining: 50,
      creditsUsed: 0,
      message: {
        content: 'Official workflow installed.',
        metadata: {},
        role: 'assistant',
      },
      threadId,
      toolCalls: [],
    });

    await controller.respondToUiAction(
      threadId,
      {
        action: 'confirm_install_official_workflow',
        payload: { sourceId: 'template-1' },
      },
      mockUser,
    );

    expect(agentOrchestratorService.handleThreadUiAction).toHaveBeenCalledWith(
      {
        action: 'confirm_install_official_workflow',
        payload: { sourceId: 'template-1' },
        threadId,
      },
      {
        organizationId,
        userId,
      },
    );
  });

  it('rejects unsupported thread UI actions', async () => {
    agentOrchestratorService.handleThreadUiAction.mockRejectedValue(
      new BadRequestException(
        'Unsupported thread UI action: unsupported_action',
      ),
    );

    await expect(
      controller.respondToUiAction(
        threadId,
        { action: 'unsupported_action' },
        mockUser,
      ),
    ).rejects.toThrow('Unsupported thread UI action: unsupported_action');
  });
});
