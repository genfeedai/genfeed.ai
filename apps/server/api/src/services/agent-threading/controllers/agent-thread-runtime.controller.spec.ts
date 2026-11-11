import { runWithActionOrigin } from '@api/action-origin/action-origin.context';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AgentThreadRuntimeController } from '@api/services/agent-threading/controllers/agent-thread-runtime.controller';
import type { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { ActionOrigin } from '@genfeedai/contracts';
import {
  GenerationEntryAttribution,
  GenerationEntryChannel,
} from '@genfeedai/contracts/interfaces/content/generation-entry.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

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

  const workObjects = {
    action: vi.fn(),
    cancelPreparedReview: vi.fn(),
    list: vi.fn(),
  };
  const resolveInputRequest = vi.fn();
  const prepareForTurn = vi.fn();
  let controller: AgentThreadRuntimeController;
  let usersService: { findOne: ReturnType<typeof vi.fn> };
  let agentOrchestratorService: {
    acceptChatStream: ReturnType<typeof vi.fn>;
    handleThreadUiAction: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resolveInputRequest.mockResolvedValue({
      requestId: 'req-1',
      status: 'resolved',
    });
    prepareForTurn.mockResolvedValue({
      existingScope: {
        contextVersion: 1,
        isLegacyFallback: false,
        isVersionExplicit: true,
        organizationId,
        source: 'explicit',
        threadId,
        userId,
      },
    });
    usersService = {
      findOne: vi.fn().mockResolvedValue({ id: userId }),
    };
    agentOrchestratorService = {
      acceptChatStream: vi.fn(),
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
        resolveInputRequest,
      } as never as AgentThreadEngineService,
      {
        assertConsequentialBoundary: vi.fn().mockResolvedValue(undefined),
        prepareForTurn,
      } as never,
      {} as never,
      {
        assertAccess: vi.fn().mockResolvedValue({ thread: { userId } }),
      } as never,
      {} as never,
      usersService as never as UsersService,
      agentOrchestratorService as never as AgentOrchestratorService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as never as LoggerService,
      workObjects as never,
    );
  });

  it('carries the API key identity into a thread UI action principal', async () => {
    agentOrchestratorService.handleThreadUiAction.mockResolvedValue({
      executionId: 'run-1',
      status: 'queued',
      threadId,
    });

    const res109 = await controller.respondToUiAction(
      threadId,
      { action: 'confirm_install_official_workflow', payload: {} },
      {
        ...mockUser,
        apiKeyId: 'key-1',
        isApiKey: true,
        scopes: ['posts:schedule'],
      } as User,
    );
    expect(res109).toEqual({
      executionId: 'run-1',
      status: 'queued',
      threadId: 'thread_current',
    });

    expect(agentOrchestratorService.handleThreadUiAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        initiatingPrincipal: {
          apiKeyId: 'key-1',
          isApiKey: true,
          organizationId,
          scopes: ['posts:schedule'],
          userId,
        },
      }),
    );
  });

  it('carries the principal into a resumed recurring-task draft', async () => {
    const resume = vi.fn().mockResolvedValue(true);
    (
      agentOrchestratorService as unknown as {
        resumeRecurringTaskDraftFromInput: typeof resume;
      }
    ).resumeRecurringTaskDraftFromInput = resume;

    const res142 = await controller.respondToInputRequest(
      threadId,
      'recurring-workflow:schedule',
      { answer: 'Every weekday at 9' },
      mockUser,
    );
    expect(res142).toMatchObject({
      requestId: 'req-1',
      status: 'resolved',
      threadId: 'thread_current',
    });

    expect(resume).toHaveBeenCalledWith(
      expect.objectContaining({
        initiatingPrincipal: {
          isApiKey: false,
          organizationId,
          scopes: [],
          userId,
        },
        organizationId,
        userId,
      }),
    );
  });

  it('continues the kickoff domain choice as its URL rather than its button label', async () => {
    resolveInputRequest.mockResolvedValue({
      requestId: 'onboarding-url:thread_current',
      fieldId: 'brandUrl',
      status: 'resolved',
    });
    const res169 = await controller.respondToInputRequest(
      threadId,
      'onboarding-url:thread_current',
      { answer: 'Use acme.com', optionIds: ['https://acme.com'] },
      mockUser,
    );
    expect(res169).toMatchObject({
      fieldId: 'brandUrl',
      requestId: 'onboarding-url:thread_current',
      status: 'resolved',
    });
    expect(agentOrchestratorService.acceptChatStream).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'https://acme.com' }),
      {
        organizationId,
        userId,
        generationEntry: undefined,
        initiatingPrincipal: expect.objectContaining({
          organizationId,
          userId,
        }),
      },
    );
  });

  it('binds failed review dispatch cleanup to its prepared token', async () => {
    workObjects.action.mockResolvedValue('review-A');
    agentOrchestratorService.handleThreadUiAction.mockRejectedValue(
      new Error('Dispatch failed late'),
    );
    await expect(
      controller.actOnWorkObject(
        threadId,
        'work-1',
        { action: 'review', revision: 1, sessionId: 'session-A' },
        mockUser,
      ),
    ).rejects.toThrow('Dispatch failed late');
    expect(workObjects.action).toHaveBeenCalledOnce();
    expect(workObjects.cancelPreparedReview).toHaveBeenCalledWith(
      expect.objectContaining({ threadId, organizationId, userId }),
      'work-1',
      'review-A',
    );
  });

  it('threads selected option ids to the engine while continuing with visible labels', async () => {
    const res211 = await controller.respondToInputRequest(
      threadId,
      'req-1',
      { answer: 'Awareness, Sales', optionIds: ['a', 'b'] },
      mockUser,
    );
    expect(res211).toMatchObject({
      requestId: 'req-1',
      status: 'resolved',
      threadId: 'thread_current',
    });
    expect(resolveInputRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        answer: 'Awareness, Sales',
        optionIds: ['a', 'b'],
      }),
    );
    expect(agentOrchestratorService.acceptChatStream).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Awareness, Sales' }),
      {
        organizationId,
        userId,
        generationEntry: undefined,
        initiatingPrincipal: expect.objectContaining({
          organizationId,
          userId,
        }),
      },
    );
  });

  it('captures the current desktop invocation when continuing an input answer', async () => {
    const generationEntry = {
      channel: GenerationEntryChannel.DESKTOP,
      attribution: GenerationEntryAttribution.CLIENT_REPORTED,
    };
    const response = await runWithActionOrigin(
      { origin: ActionOrigin.UI, generationEntry },
      () =>
        controller.respondToInputRequest(
          threadId,
          'req-1',
          { answer: 'Use hybrid' },
          mockUser,
        ),
    );
    expect(agentOrchestratorService.acceptChatStream).toHaveBeenCalledWith(
      expect.anything(),
      {
        organizationId,
        userId,
        generationEntry,
        initiatingPrincipal: expect.objectContaining({
          organizationId,
          userId,
        }),
      },
    );
    expect(response).toMatchObject({ threadId, requestId: 'req-1' });
  });

  it('returns the execution that continues an answered input request', async () => {
    agentOrchestratorService.acceptChatStream.mockResolvedValue({
      executionId: 'run-answer',
      queuedAt: '2026-09-23T15:10:00.000Z',
      status: 'queued',
      threadId,
    });

    const response = await controller.respondToInputRequest(
      threadId,
      'req-1',
      { answer: 'Use hybrid' },
      mockUser,
    );

    expect(agentOrchestratorService.acceptChatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        clientRequestId: 'input-response:req-1',
        content: 'Use hybrid',
        threadId,
      }),
      {
        organizationId,
        userId,
        generationEntry: undefined,
        initiatingPrincipal: expect.objectContaining({
          organizationId,
          userId,
        }),
      },
    );
    expect(response).toEqual(
      expect.objectContaining({
        executionId: 'run-answer',
        queuedAt: '2026-09-23T15:10:00.000Z',
        requestId: 'req-1',
      }),
    );
  });

  describe('answering in a thread shared with the member (#9964)', () => {
    const ownerUserId = 'user_owner';
    const sharedScope = {
      contextVersion: 1,
      isLegacyFallback: false,
      isVersionExplicit: true,
      organizationId,
      source: 'explicit',
      threadId,
      threadOwnerUserId: ownerUserId,
      userId,
    };

    it('resolves the question and continues the turn as the answering member', async () => {
      prepareForTurn.mockResolvedValue({ existingScope: sharedScope });
      agentOrchestratorService.acceptChatStream.mockResolvedValue({
        executionId: 'run-member',
        queuedAt: '2026-11-11T14:00:00.000Z',
        status: 'queued',
        threadId,
      });

      const response = await controller.respondToInputRequest(
        threadId,
        'req-1',
        { answer: 'Use hybrid' },
        mockUser,
      );

      expect(prepareForTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          isSharedCollaborationAllowed: true,
          threadId,
          userId,
        }),
      );
      expect(resolveInputRequest).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'req-1', userId }),
      );
      expect(agentOrchestratorService.acceptChatStream).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Use hybrid' }),
        expect.objectContaining({ organizationId, userId }),
      );
      expect(response).toMatchObject({
        executionId: 'run-member',
        requestId: 'req-1',
        status: 'resolved',
      });
    });

    it('leaves a recurring-task question to the thread owner', async () => {
      prepareForTurn.mockResolvedValue({ existingScope: sharedScope });

      await expect(
        controller.respondToInputRequest(
          threadId,
          'recurring-workflow:draft-1',
          { answer: 'Weekly' },
          mockUser,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(resolveInputRequest).not.toHaveBeenCalled();
      expect(agentOrchestratorService.acceptChatStream).not.toHaveBeenCalled();
    });

    it('resolves nothing for a member whose share only lets them view', async () => {
      prepareForTurn.mockRejectedValue(
        new ForbiddenException('This thread is shared with you to view only.'),
      );

      await expect(
        controller.respondToInputRequest(
          threadId,
          'req-1',
          { answer: 'Use hybrid' },
          mockUser,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(resolveInputRequest).not.toHaveBeenCalled();
      expect(agentOrchestratorService.acceptChatStream).not.toHaveBeenCalled();
    });
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

    const res319 = await controller.respondToUiAction(
      threadId,
      {
        action: 'confirm_install_official_workflow',
        payload: { sourceId: 'template-1' },
      },
      mockUser,
    );
    expect(res319).toMatchObject({
      message: { content: 'Official workflow installed.', role: 'assistant' },
      toolCalls: [],
    });

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
        initiatingPrincipal: expect.objectContaining({
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

    const res363 = await controller.respondToUiAction(
      threadId,
      {
        action: 'confirm_generate_media',
        payload: { generationType: 'image', prompt: 'a rocket' },
      },
      mockUser,
    );
    expect(res363).toMatchObject({
      message: { content: 'Confirmed image generation.', role: 'assistant' },
      toolCalls: [],
    });

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
