import {
  type AgentOrchestratorUiActionHost,
  AgentOrchestratorUiActionService,
} from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.service';
import { AgentToolName } from '@genfeedai/interfaces';
import {
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'c7a123456789012345678901';
const USER_ID = 'c7a123456789012345678902';
const THREAD_ID = 'c7a123456789012345678903';

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
    runInThreadLane: vi.fn(
      async <T>(_threadId: string, run: () => Promise<T>) => run(),
    ),
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
    recordThreadTurnRequested: vi.fn().mockResolvedValue(undefined),
    recordThreadTurnStarted: vi.fn().mockResolvedValue(undefined),
    recordToolCompleted: vi.fn().mockResolvedValue(undefined),
    recordToolStarted: vi.fn().mockResolvedValue(undefined),
    recordUiBlocksUpdated: vi.fn().mockResolvedValue(undefined),
  };

  const service = new AgentOrchestratorUiActionService(
    {
      resolveModelKey: vi.fn().mockResolvedValue('test-model'),
    } as never,
    {
      findOne: vi.fn().mockResolvedValue({
        id: THREAD_ID,
        isDeleted: false,
        organizationId: ORG_ID,
        status: 'active',
        userId: USER_ID,
      }),
    } as never,
    {
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
    } as never,
    {
      addMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
    } as never,
    {
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(50),
    } as never,
    { executeTool } as never,
    {
      buildAssistantUiActions: vi.fn((params: { uiActions: unknown[] }) => ({
        suggestedActions: [],
        uiActions: params.uiActions,
      })),
    } as never,
    threadEventRecorder as never,
    {
      findOne: vi.fn().mockResolvedValue({}),
    } as never,
    {
      mergeMetadata: vi.fn().mockResolvedValue(undefined),
    } as never,
    {
      acquireLock: vi.fn().mockResolvedValue(true),
      get: vi.fn().mockResolvedValue(null),
      releaseLock: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    } as never,
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
    expect(result.message.content).toBe('Image generated.');
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
        detail: 'Authentication required',
        status: HttpStatus.UNAUTHORIZED,
        title: 'Unauthorized',
      }),
    );
    expect(threadEventRecorder.recordRunFailed).toHaveBeenCalled();
  });

  it('maps an expired-session 401 from generate-media to 401', async () => {
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
