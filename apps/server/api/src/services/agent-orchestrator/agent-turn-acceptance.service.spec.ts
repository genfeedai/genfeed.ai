import { RouterPriority } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AgentTurnAcceptanceService,
  buildAgentTurnIdempotencyKey,
} from './agent-turn-acceptance.service';

describe('AgentTurnAcceptanceService', () => {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const prisma = {
    agentThread: {
      findFirstOrThrow: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const scopeService = {
    prepareForTurn: vi.fn(),
    resolveCreatedThreadScope: vi.fn(),
  };
  const workflowRunner = {
    enqueueWorkflow: vi.fn(),
  };
  const agentMessagesService = {
    addMessage: vi.fn(),
  };

  let service: AgentTurnAcceptanceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentTurnAcceptanceService(
      logger as never,
      prisma as never,
      scopeService as never,
      workflowRunner as never,
      agentMessagesService as never,
    );
    scopeService.prepareForTurn.mockResolvedValue({
      initialBrandId: 'brand-1',
      initialScopeFields: {
        brandId: 'brand-1',
        contextVersion: 1,
      },
    });
    prisma.agentThread.upsert.mockImplementation(({ create }) =>
      Promise.resolve({
        brandId: create.brandId,
        contextVersion: create.contextVersion,
      }),
    );
    workflowRunner.enqueueWorkflow.mockResolvedValue({
      executionId: 'execution-1',
    });
    scopeService.resolveCreatedThreadScope.mockImplementation(
      ({ brandId, organizationId, threadId, userId }) =>
        Promise.resolve({
          brandId,
          contextVersion: 1,
          isLegacyFallback: false,
          isVersionExplicit: true,
          organizationId,
          source: 'thread_created',
          threadId,
          userId,
        }),
    );
    agentMessagesService.addMessage.mockResolvedValue({});
  });

  it('durably acknowledges a new turn with stable request, execution, thread, and context identity', async () => {
    const acknowledgement = await service.accept(
      {
        brandId: 'brand-1',
        clientRequestId: '018f6f76-b821-7a51-82af-93d0ecac2101',
        content: 'Generate an image of a lighthouse',
        source: 'agent',
      },
      {
        apiKeyContext: { isApiKey: false, scopes: [] },
        organizationId: 'org-1',
        userId: 'user-1',
      },
    );

    expect(acknowledgement).toEqual({
      brandId: 'brand-1',
      clientRequestId: '018f6f76-b821-7a51-82af-93d0ecac2101',
      contextId: `${acknowledgement.threadId}:v1`,
      contextVersion: 1,
      executionId: 'execution-1',
      queuedAt: expect.any(String),
      status: 'queued',
      threadId: expect.any(String),
    });
    expect(workflowRunner.enqueueWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'agent.turn.execute',
        canonicalId: 'agent.turn.execute',
        idempotencyKey: buildAgentTurnIdempotencyKey(
          'org-1',
          'user-1',
          '018f6f76-b821-7a51-82af-93d0ecac2101',
        ),
        inputValues: {
          request: expect.objectContaining({
            brandId: 'brand-1',
            clientRequestId: acknowledgement.clientRequestId,
            content: 'Generate an image of a lighthouse',
            source: 'agent',
            threadId: acknowledgement.threadId,
          }),
        },
        metadata: expect.objectContaining({
          clientRequestId: acknowledgement.clientRequestId,
          contextId: acknowledgement.contextId,
          source: 'agent',
          threadId: acknowledgement.threadId,
        }),
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    expect(agentMessagesService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        content: 'Generate an image of a lighthouse',
        id: acknowledgement.executionId,
        organizationId: 'org-1',
        room: acknowledgement.threadId,
        userId: 'user-1',
      }),
    );
  });

  it('returns the same durable identities and idempotency key when an acknowledgement is retried', async () => {
    const request = {
      clientRequestId: '018f6f76-b821-7a51-82af-93d0ecac2101',
      content: 'Generate an image of a lighthouse',
    };
    const context = {
      organizationId: 'org-1',
      userId: 'user-1',
    };

    const first = await service.accept(request, context);
    const retry = await service.accept(request, context);

    expect(retry).toEqual(
      expect.objectContaining({
        clientRequestId: first.clientRequestId,
        contextId: first.contextId,
        executionId: first.executionId,
        threadId: first.threadId,
      }),
    );
    expect(workflowRunner.enqueueWorkflow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        idempotencyKey: buildAgentTurnIdempotencyKey(
          'org-1',
          'user-1',
          request.clientRequestId,
        ),
      }),
    );
  });

  it('derives the thread id deterministically from the client request identity', async () => {
    const first = await service.accept(
      { clientRequestId: 'stable-identity', content: 'Generate safely' },
      { organizationId: 'org-1', userId: 'user-1' },
    );
    const second = await service.accept(
      { clientRequestId: 'stable-identity', content: 'Generate safely' },
      { organizationId: 'org-1', userId: 'user-1' },
    );

    expect(second.threadId).toBe(first.threadId);
  });

  it('persists explicit media routing and structured settings into the durable workflow request', async () => {
    const acknowledgement = await service.accept(
      {
        clientRequestId: 'explicit-image',
        content: 'Generate a red apple',
        generationMode: 'image',
        generationSettings: {
          aspectRatio: '1:1',
          model: 'black-forest-labs/flux-schnell',
          outputs: 2,
          prioritize: RouterPriority.SPEED,
        },
      },
      { organizationId: 'org-1', userId: 'user-1' },
    );

    expect(workflowRunner.enqueueWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        inputValues: {
          request: expect.objectContaining({
            generationMode: 'image',
            generationSettings: {
              aspectRatio: '1:1',
              model: 'black-forest-labs/flux-schnell',
              outputs: 2,
              prioritize: 'speed',
            },
          }),
        },
      }),
    );
    expect(agentMessagesService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: acknowledgement.executionId,
        metadata: expect.objectContaining({
          generationMode: 'image',
          generationSettings: expect.objectContaining({
            model: 'black-forest-labs/flux-schnell',
          }),
        }),
      }),
    );
  });

  it('propagates an enqueue failure instead of acknowledging the turn', async () => {
    workflowRunner.enqueueWorkflow.mockRejectedValueOnce(
      new Error('redis unavailable'),
    );

    await expect(
      service.accept(
        { clientRequestId: 'enqueue-failure', content: 'Generate safely' },
        { organizationId: 'org-1', userId: 'user-1' },
      ),
    ).rejects.toThrow('redis unavailable');
  });

  it('keeps the authorized existing thread and context version on retries', async () => {
    scopeService.prepareForTurn.mockResolvedValue({
      existingScope: {
        brandId: 'brand-2',
        contextVersion: 7,
        threadId: 'thread-existing',
      },
      initialScopeFields: {},
    });
    prisma.agentThread.findFirstOrThrow.mockResolvedValue({
      brandId: 'brand-2',
      contextVersion: 7,
      status: 'ACTIVE',
    });

    const acknowledgement = await service.accept(
      {
        clientRequestId: '018f6f76-b821-7a51-82af-93d0ecac2102',
        content: 'Continue',
        expectedContextVersion: 7,
        threadId: 'thread-existing',
      },
      { organizationId: 'org-1', userId: 'user-1' },
    );

    expect(acknowledgement).toEqual(
      expect.objectContaining({
        brandId: 'brand-2',
        contextId: 'thread-existing:v7',
        contextVersion: 7,
        threadId: 'thread-existing',
      }),
    );
    expect(prisma.agentThread.upsert).not.toHaveBeenCalled();
  });

  it('refuses to accept a turn on an archived thread', async () => {
    scopeService.prepareForTurn.mockResolvedValue({
      existingScope: {
        brandId: 'brand-2',
        contextVersion: 3,
        threadId: 'thread-archived',
      },
      initialScopeFields: {},
    });
    prisma.agentThread.findFirstOrThrow.mockResolvedValue({
      brandId: 'brand-2',
      contextVersion: 3,
      status: 'ARCHIVED',
    });

    await expect(
      service.accept(
        {
          clientRequestId: 'archived-thread',
          content: 'Continue',
          threadId: 'thread-archived',
        },
        { organizationId: 'org-1', userId: 'user-1' },
      ),
    ).rejects.toThrow('This thread is archived');
    expect(workflowRunner.enqueueWorkflow).not.toHaveBeenCalled();
  });
});
