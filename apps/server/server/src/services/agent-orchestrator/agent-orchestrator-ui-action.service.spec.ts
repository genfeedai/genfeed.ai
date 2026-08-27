import {
  type AgentOrchestratorUiActionHost,
  AgentOrchestratorUiActionService,
} from '@server/services/agent-orchestrator/agent-orchestrator-ui-action.service';
import { AgentOrchestratorUiActionBrandIdentityService } from '@server/services/agent-orchestrator/agent-orchestrator-ui-action-brand-identity.service';
import { AgentOrchestratorUiActionConfirmedToolService } from '@server/services/agent-orchestrator/agent-orchestrator-ui-action-confirmed-tool.service';
import { AgentOrchestratorUiActionFinalizerService } from '@server/services/agent-orchestrator/agent-orchestrator-ui-action-finalizer.service';
import { AgentOrchestratorUiActionPlanService } from '@server/services/agent-orchestrator/agent-orchestrator-ui-action-plan.service';
import { ErrorCode } from '@genfeedai/enums';
import { AgentToolName } from '@genfeedai/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import {
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = testId('org');
const USER_ID = testId('user');
const THREAD_ID = testId('thread');

const GENERATE_MEDIA_REQUEST = {
  action: 'confirm_generate_media' as const,
  payload: {
    generationType: 'image',
    prompt: 'Editorial product photo on a dark neutral set',
    sourceActionId: 'generation-card-1',
  },
  threadId: THREAD_ID,
};

function createHost(): AgentOrchestratorUiActionHost {
  return {
    executeSynchronousChatLoop: vi.fn(),
    generatePlanModeResponse: vi.fn(),
    runInThreadLane: async <T>(
      _threadId: string,
      run: () => Promise<T>,
    ): Promise<T> => run(),
  };
}

function createService(overrides?: { executeTool?: ReturnType<typeof vi.fn> }) {
  const executeTool =
    overrides?.executeTool ??
    vi.fn().mockResolvedValue({
      creditsUsed: 0,
      data: { id: 'image-1', url: 'https://cdn.example.com/image-1.png' },
      nextActions: [],
      success: true,
    });

  const threadEventRecorder = {
    recordAssistantFinalized: vi.fn().mockResolvedValue(undefined),
    recordRunCompleted: vi.fn().mockResolvedValue(undefined),
    recordRunFailed: vi.fn().mockResolvedValue(undefined),
    recordPlanUpserted: vi.fn().mockResolvedValue(undefined),
    recordThreadTurnRequested: vi.fn().mockResolvedValue(undefined),
    recordThreadTurnStarted: vi.fn().mockResolvedValue(undefined),
    recordToolCompleted: vi.fn().mockResolvedValue(undefined),
    recordToolStarted: vi.fn().mockResolvedValue(undefined),
    recordUiBlocksUpdated: vi.fn().mockResolvedValue(undefined),
  };

  const agentChatModelRegistry = {
    getRoundCredits: vi.fn().mockResolvedValue(1),
    resolveModelKey: vi.fn().mockResolvedValue('test-model'),
  };
  const agentThreadsService = {
    findOne: vi.fn().mockResolvedValue({
      id: THREAD_ID,
      isDeleted: false,
      organizationId: ORG_ID,
      status: 'active',
      userId: USER_ID,
    }),
  };
  const agentScopeContextService = {
    assertConsequentialBoundary: vi.fn().mockResolvedValue(undefined),
    prepareForTurn: vi.fn().mockResolvedValue({
      existingScope: {
        brandId: 'brand-1',
        contextVersion: 1,
        isLegacyFallback: false,
        isVersionExplicit: true,
        organizationId: ORG_ID,
        source: 'explicit',
        threadId: THREAD_ID,
        userId: USER_ID,
      },
    }),
  };
  const agentMessagesService = {
    addMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
  };
  const creditsUtilsService = {
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(50),
  };
  const agentRunsService = {
    mergeMetadata: vi.fn().mockResolvedValue(undefined),
  };
  const cacheService = {
    acquireLock: vi.fn().mockResolvedValue(true),
    get: vi.fn().mockResolvedValue(null),
    releaseLock: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  };
  const completionCardBuilder = {
    buildAssistantUiActions: vi.fn((params: { uiActions: unknown[] }) => ({
      suggestedActions: [],
      uiActions: params.uiActions,
    })),
  };
  const finalizer = new AgentOrchestratorUiActionFinalizerService(
    agentMessagesService as never,
    agentRunsService as never,
    creditsUtilsService as never,
    completionCardBuilder as never,
    threadEventRecorder as never,
  );
  const brandIdentityActions =
    new AgentOrchestratorUiActionBrandIdentityService(
      agentMessagesService as never,
      creditsUtilsService as never,
      { executeTool } as never,
      threadEventRecorder as never,
      agentScopeContextService as never,
      agentRunsService as never,
      cacheService as never,
      finalizer,
    );
  const confirmedToolActions =
    new AgentOrchestratorUiActionConfirmedToolService(
      { executeTool } as never,
      threadEventRecorder as never,
      finalizer,
      cacheService as never,
    );
  const planActions = new AgentOrchestratorUiActionPlanService(
    agentChatModelRegistry as never,
    threadEventRecorder as never,
  );

  const service = new AgentOrchestratorUiActionService(
    agentChatModelRegistry as never,
    agentThreadsService as never,
    agentScopeContextService as never,
    threadEventRecorder as never,
    {
      findOne: vi.fn().mockResolvedValue({}),
    } as never,
    agentRunsService as never,
    cacheService as never,
    brandIdentityActions,
    confirmedToolActions,
    planActions,
  );

  return { executeTool, service, threadEventRecorder };
}

async function expectHttpStatus(
  action: Promise<unknown>,
  status: HttpStatus,
): Promise<HttpException> {
  let thrown: unknown;
  try {
    await action;
  } catch (error: unknown) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(HttpException);
  const httpError = thrown as HttpException;
  expect(httpError.getStatus()).toBe(status);
  return httpError;
}

describe('AgentOrchestratorUiActionService auth mapping', () => {
  let host: AgentOrchestratorUiActionHost;

  beforeEach(() => {
    host = createHost();
  });

  it('completes confirmed generate-media when credentials are valid', async () => {
    const { executeTool, service } = createService();

    const result = await service.handleThreadUiAction(
      GENERATE_MEDIA_REQUEST,
      { organizationId: ORG_ID, userId: USER_ID },
      host,
    );

    expect(executeTool).toHaveBeenCalledWith(
      AgentToolName.GENERATE_IMAGE,
      expect.objectContaining({
        prompt: 'Editorial product photo on a dark neutral set',
      }),
      expect.objectContaining({
        organizationId: ORG_ID,
        threadId: THREAD_ID,
        userId: USER_ID,
      }),
    );
    expect(result.message.content).toBe('Image generation accepted.');
  });

  it('forwards the outputs count on confirmed generate-media', async () => {
    const { executeTool, service } = createService();

    await service.handleThreadUiAction(
      {
        ...GENERATE_MEDIA_REQUEST,
        payload: {
          ...GENERATE_MEDIA_REQUEST.payload,
          outputs: 3,
        },
      },
      { organizationId: ORG_ID, userId: USER_ID },
      host,
    );

    expect(executeTool).toHaveBeenCalledWith(
      AgentToolName.GENERATE_IMAGE,
      expect.objectContaining({
        outputs: 3,
        prompt: 'Editorial product photo on a dark neutral set',
      }),
      expect.objectContaining({
        organizationId: ORG_ID,
      }),
    );
  });

  it('maps a swallowed upstream 401 from generate-media to 401, not 500', async () => {
    const { service, threadEventRecorder } = createService({
      executeTool: vi.fn().mockResolvedValue({
        creditsUsed: 0,
        error: 'Request failed with status code 401',
        success: false,
      }),
    });

    const error = await expectHttpStatus(
      service.handleThreadUiAction(
        GENERATE_MEDIA_REQUEST,
        { organizationId: ORG_ID, userId: USER_ID },
        host,
      ),
      HttpStatus.UNAUTHORIZED,
    );

    expect(error).not.toBeInstanceOf(InternalServerErrorException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({
        detail: 'The model provider rejected the credentials for this request.',
        status: HttpStatus.UNAUTHORIZED,
        title: 'Unauthorized',
      }),
    );
    expect(threadEventRecorder.recordRunFailed).toHaveBeenCalled();
  });

  it('maps an upstream Unauthorized tool failure to provider-auth 401 detail', async () => {
    const { service } = createService({
      executeTool: vi.fn().mockResolvedValue({
        creditsUsed: 0,
        error: 'Unauthorized',
        success: false,
      }),
    });

    const error = await expectHttpStatus(
      service.handleThreadUiAction(
        GENERATE_MEDIA_REQUEST,
        { organizationId: ORG_ID, userId: USER_ID },
        host,
      ),
      HttpStatus.UNAUTHORIZED,
    );

    expect(error).not.toBeInstanceOf(InternalServerErrorException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({
        detail: 'The model provider rejected the credentials for this request.',
        status: HttpStatus.UNAUTHORIZED,
      }),
    );
  });

  it('maps a provider 401 thrown through generate-media to 401', async () => {
    const providerAuthError = Object.assign(
      new Error('Request failed with status code 401'),
      { response: { status: 401 }, status: 401 },
    );
    const { service } = createService({
      executeTool: vi.fn().mockRejectedValue(providerAuthError),
    });

    const error = await expectHttpStatus(
      service.handleThreadUiAction(
        GENERATE_MEDIA_REQUEST,
        { organizationId: ORG_ID, userId: USER_ID },
        host,
      ),
      HttpStatus.UNAUTHORIZED,
    );

    expect(error).not.toBeInstanceOf(InternalServerErrorException);
  });

  it('does not leak bearer tokens when remapping a 401', async () => {
    const { service } = createService({
      executeTool: vi.fn().mockResolvedValue({
        creditsUsed: 0,
        error: '401 Unauthorized: Bearer sk-secret-token',
        success: false,
      }),
    });

    const error = await expectHttpStatus(
      service.handleThreadUiAction(
        GENERATE_MEDIA_REQUEST,
        { organizationId: ORG_ID, userId: USER_ID },
        host,
      ),
      HttpStatus.UNAUTHORIZED,
    );

    expect(JSON.stringify(error.getResponse())).not.toContain(
      'sk-secret-token',
    );
    expect(JSON.stringify(error.getResponse())).not.toContain('Bearer');
  });

  it('preserves a specific generate-media 403 detail', async () => {
    const { service } = createService({
      executeTool: vi.fn().mockResolvedValue({
        creditsUsed: 0,
        error:
          'Request failed with status code 403: Model not enabled for this organization',
        success: false,
      }),
    });

    const error = await expectHttpStatus(
      service.handleThreadUiAction(
        GENERATE_MEDIA_REQUEST,
        { organizationId: ORG_ID, userId: USER_ID },
        host,
      ),
      HttpStatus.FORBIDDEN,
    );

    expect(error.getResponse()).toEqual(
      expect.objectContaining({
        detail: 'Model not enabled for this organization',
        status: HttpStatus.FORBIDDEN,
        title: 'Forbidden',
      }),
    );
  });

  it('maps a forbidden generate-media failure to 403', async () => {
    const { service } = createService({
      executeTool: vi.fn().mockResolvedValue({
        creditsUsed: 0,
        error: 'Request failed with status code 403',
        success: false,
      }),
    });

    const error = await expectHttpStatus(
      service.handleThreadUiAction(
        GENERATE_MEDIA_REQUEST,
        { organizationId: ORG_ID, userId: USER_ID },
        host,
      ),
      HttpStatus.FORBIDDEN,
    );

    expect(error).not.toBeInstanceOf(InternalServerErrorException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({
        detail: 'Insufficient permissions',
        status: HttpStatus.FORBIDDEN,
        title: 'Forbidden',
      }),
    );
  });

  it('maps a cancelled generate to 409, not a 500 connection failure', async () => {
    const { service } = createService({
      executeTool: vi.fn().mockResolvedValue({
        creditsUsed: 0,
        error: 'Request failed with status code 500: Cancelled by user',
        success: false,
      }),
    });

    const error = await expectHttpStatus(
      service.handleThreadUiAction(
        GENERATE_MEDIA_REQUEST,
        { organizationId: ORG_ID, userId: USER_ID },
        host,
      ),
      HttpStatus.CONFLICT,
    );

    expect(error).not.toBeInstanceOf(InternalServerErrorException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({
        detail: 'Cancelled by user',
        status: HttpStatus.CONFLICT,
      }),
    );
  });

  it('preserves a Hailuo first-frame validation 400 instead of a generic 500', async () => {
    const { service } = createService({
      executeTool: vi.fn().mockResolvedValue({
        creditsUsed: 0,
        error:
          'Request failed with status code 400: first_frame_image is required',
        success: false,
      }),
    });

    const error = await expectHttpStatus(
      service.handleThreadUiAction(
        {
          action: 'confirm_generate_media',
          payload: {
            generationType: 'video',
            model: 'minimax/hailuo-2.3-fast',
            prompt: 'A cinematic product reveal',
            sourceActionId: 'generation-card-1',
          },
          threadId: THREAD_ID,
        },
        { organizationId: ORG_ID, userId: USER_ID },
        host,
      ),
      HttpStatus.BAD_REQUEST,
    );

    expect(error).not.toBeInstanceOf(InternalServerErrorException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({
        detail: 'first_frame_image is required',
        status: HttpStatus.BAD_REQUEST,
        title: 'Validation failed',
      }),
    );
  });

  it('does not leak provider payloads when remapping a 400', async () => {
    const { service } = createService({
      executeTool: vi.fn().mockResolvedValue({
        creditsUsed: 0,
        error:
          'Request failed with status code 400: {"input":{"prompt":"secret-prompt"},"error":"validation"}',
        success: false,
      }),
    });

    const error = await expectHttpStatus(
      service.handleThreadUiAction(
        GENERATE_MEDIA_REQUEST,
        { organizationId: ORG_ID, userId: USER_ID },
        host,
      ),
      HttpStatus.BAD_REQUEST,
    );

    const serialized = JSON.stringify(error.getResponse());
    expect(serialized).not.toContain('secret-prompt');
    expect(serialized).not.toContain('{"input"');
  });

  it('preserves an unusable image result as a structured upstream failure', async () => {
    const safeResultError =
      'Image generation finished without a usable CDN URL.';
    const { service, threadEventRecorder } = createService({
      executeTool: vi.fn().mockResolvedValue({
        creditsUsed: 0,
        error: `Failed to respond to UI action: 500 - ${safeResultError}`,
        success: false,
      }),
    });

    const error = await expectHttpStatus(
      service.handleThreadUiAction(
        GENERATE_MEDIA_REQUEST,
        { organizationId: ORG_ID, userId: USER_ID },
        host,
      ),
      HttpStatus.BAD_GATEWAY,
    );

    expect(error).not.toBeInstanceOf(InternalServerErrorException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        detail: safeResultError,
        status: HttpStatus.BAD_GATEWAY,
        title: 'Generation result unavailable',
      }),
    );
    expect(threadEventRecorder.recordRunFailed).toHaveBeenCalled();
  });

  it('keeps unexpected generate-media failures as 500', async () => {
    const { service } = createService({
      executeTool: vi.fn().mockResolvedValue({
        creditsUsed: 0,
        error: 'Generation backend exploded',
        success: false,
      }),
    });

    const error = await expectHttpStatus(
      service.handleThreadUiAction(
        GENERATE_MEDIA_REQUEST,
        { organizationId: ORG_ID, userId: USER_ID },
        host,
      ),
      HttpStatus.INTERNAL_SERVER_ERROR,
    );

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(error.message).toContain('Generation backend exploded');
  });

  it('forwards confirmed publish targets through CREATE_POST', async () => {
    const targets = [
      {
        caption: 'LinkedIn version',
        credentialId: 'cred-linkedin',
        platform: 'linkedin',
      },
      {
        caption: 'X version',
        credentialId: 'cred-twitter',
        platform: 'twitter',
      },
    ];
    const { executeTool, service } = createService({
      executeTool: vi.fn().mockResolvedValue({
        creditsUsed: 0,
        data: {
          createdPlatforms: ['linkedin', 'twitter'],
          totalCreated: 2,
        },
        nextActions: [],
        success: true,
      }),
    });

    const result = await service.handleThreadUiAction(
      {
        action: 'confirm_publish_post',
        payload: {
          caption: 'Shared caption',
          contentId: 'ingredient-1',
          platforms: ['linkedin', 'twitter'],
          sourceActionId: 'publish-card-1',
          targets,
        },
        threadId: THREAD_ID,
      },
      { organizationId: ORG_ID, userId: USER_ID },
      host,
    );

    expect(executeTool).toHaveBeenCalledWith(
      AgentToolName.CREATE_POST,
      expect.objectContaining({
        caption: 'Shared caption',
        confirmed: true,
        contentId: 'ingredient-1',
        targets,
      }),
      expect.objectContaining({
        organizationId: ORG_ID,
        threadId: THREAD_ID,
        userId: USER_ID,
      }),
    );
    expect(result.message.content).toContain(
      'Queued 2 posts on linkedin, twitter',
    );
  });

  it('routes plan revision through the plan-mode host without executing a tool', async () => {
    const { executeTool, service } = createService();
    const revisedResult = {
      creditsRemaining: 49,
      creditsUsed: 1,
      message: {
        content: 'Revised plan ready for review.',
        metadata: { reviewRequired: true },
        role: 'assistant',
      },
      threadId: THREAD_ID,
      toolCalls: [],
    };
    host.generatePlanModeResponse = vi.fn().mockResolvedValue(revisedResult);

    const result = await service.handleThreadUiAction(
      {
        action: 'revise_plan',
        payload: { revisionNote: 'Split delivery into two safe phases.' },
        threadId: THREAD_ID,
      },
      { organizationId: ORG_ID, userId: USER_ID },
      host,
    );

    expect(host.generatePlanModeResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          content:
            'Revise the current implementation plan using this feedback: Split delivery into two safe phases.',
        }),
        reviewMetadata: {
          lastReviewAction: 'request_changes',
          revisionNote: 'Split delivery into two safe phases.',
        },
      }),
    );
    expect(executeTool).not.toHaveBeenCalled();
    expect(result).toEqual({
      ...revisedResult,
      brandId: 'brand-1',
      contextVersion: 1,
    });
  });

  it('maps a swallowed 401 from other confirmed UI actions to 401', async () => {
    const { service } = createService({
      executeTool: vi.fn().mockResolvedValue({
        creditsUsed: 0,
        error: 'Request failed with status code 401',
        success: false,
      }),
    });

    const error = await expectHttpStatus(
      service.handleThreadUiAction(
        {
          action: 'confirm_publish_post',
          payload: { contentId: 'ingredient-1', platforms: ['linkedin'] },
          threadId: THREAD_ID,
        },
        { organizationId: ORG_ID, userId: USER_ID },
        host,
      ),
      HttpStatus.UNAUTHORIZED,
    );

    expect(error).not.toBeInstanceOf(InternalServerErrorException);
  });
});
