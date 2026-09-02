import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AgentThreadRuntimeController } from '@api/services/agent-threading/controllers/agent-thread-runtime.controller';
import type { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

vi.mock('@api/helpers/utils/error-response/error-response.util', () => ({
  ErrorResponse: {
    handle: vi.fn((error: unknown) => {
      throw error;
    }),
  },
}));

describe('Threading AgentThreadRuntimeController', () => {
  const organizationId = 'org_current';
  const userId = 'user_current';
  const threadId = 'thread_current';
  const mockUser = {
    id: 'authProvider_123',
    brandId: 'brand_current',
    organizationId: organizationId,
    userId: userId,
  } as unknown as User;

  let controller: AgentThreadRuntimeController;
  let usersService: { findOne: ReturnType<typeof vi.fn> };
  let agentOrchestratorService: {
    handleThreadUiAction: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    usersService = {
      findOne: vi.fn().mockResolvedValue({ id: userId }),
    };
    agentOrchestratorService = {
      handleThreadUiAction: vi.fn(),
    };

    controller = new AgentThreadRuntimeController(
      {
        getSnapshot: vi.fn().mockResolvedValue({
          lastSequence: 0,
          memorySummaryRefs: [],
          pendingApprovals: [],
          pendingInputRequests: [],
          timeline: [],
        }),
        listEvents: vi.fn().mockResolvedValue([]),
        recordMemoryFlush: vi.fn().mockResolvedValue(undefined),
        resolveInputRequest: vi.fn().mockResolvedValue({
          requestId: 'req-1',
          status: 'resolved',
        }),
      } as never as AgentThreadEngineService,
      {
        assertConsequentialBoundary: vi.fn().mockResolvedValue(undefined),
        prepareForTurn: vi.fn().mockResolvedValue({
          existingScope: {
            contextVersion: 1,
            isLegacyFallback: false,
            isVersionExplicit: true,
            organizationId,
            source: 'explicit',
            threadId,
            userId,
          },
        }),
      } as never,
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
      expect.objectContaining({
        action: 'confirm_install_official_workflow',
        payload: { sourceId: 'template-1' },
        threadId,
      }),
      {
        apiKeyContext: expect.objectContaining({
          organizationId,
          userId,
        }),
        organizationId,
        userId,
      },
    );
    expect(usersService.findOne).not.toHaveBeenCalled();
  });

  it('passes confirm_generate_media through with the resolved principal', async () => {
    agentOrchestratorService.handleThreadUiAction.mockResolvedValue({
      creditsRemaining: 50,
      creditsUsed: 0,
      message: {
        content: 'Confirmed image generation.',
        metadata: {},
        role: 'assistant',
      },
      threadId,
      toolCalls: [],
    });

    await controller.respondToUiAction(
      threadId,
      {
        action: 'confirm_generate_media',
        payload: { generationType: 'image', prompt: 'a rocket' },
      },
      mockUser,
    );

    expect(agentOrchestratorService.handleThreadUiAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'confirm_generate_media' }),
      expect.objectContaining({
        organizationId,
        userId,
      }),
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
