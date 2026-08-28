import { AgentRunStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentTurnAcceptanceService } from './agent-turn-acceptance.service';

describe('AgentTurnAcceptanceService', () => {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const prisma = {
    agentRun: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    agentThread: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const scopeService = {
    prepareForTurn: vi.fn(),
    resolveCreatedThreadScope: vi.fn(),
  };
  const queueService = {
    queueRun: vi.fn(),
  };
  const credentialCryptoService = {
    encrypt: vi.fn(() => 'encrypted-token'),
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
      queueService as never,
      credentialCryptoService as never,
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
        id: create.id,
      }),
    );
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
    prisma.agentRun.upsert.mockImplementation(({ create }) =>
      Promise.resolve(create),
    );
    agentMessagesService.addMessage.mockResolvedValue({});
    queueService.queueRun.mockResolvedValue('agent-run-job');
    prisma.agentRun.updateMany.mockResolvedValue({ count: 1 });
  });

  it('durably acknowledges a new turn with stable request, run, thread, and context identity', async () => {
    const acknowledgement = await service.accept(
      {
        brandId: 'brand-1',
        clientRequestId: '018f6f76-b821-7a51-82af-93d0ecac2101',
        content: 'Generate an image of a lighthouse',
        source: 'agent',
      },
      {
        apiKeyContext: { isApiKey: false, scopes: [] },
        authToken: 'session-token',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    );

    expect(acknowledgement).toEqual({
      brandId: 'brand-1',
      clientRequestId: '018f6f76-b821-7a51-82af-93d0ecac2101',
      contextId: `${acknowledgement.threadId}:v1`,
      contextVersion: 1,
      queuedAt: expect.any(String),
      runId: expect.any(String),
      status: 'queued',
      threadId: expect.any(String),
    });
    expect(prisma.agentRun.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          config: {
            durableQueuePayload: expect.objectContaining({
              clientRequestId: acknowledgement.clientRequestId,
              encryptedAuthToken: 'encrypted-token',
              kind: 'agent-chat-turn',
              runId: acknowledgement.runId,
            }),
          },
          id: acknowledgement.runId,
          metadata: expect.objectContaining({
            clientRequestId: acknowledgement.clientRequestId,
            contextId: acknowledgement.contextId,
            requestState: 'queued',
          }),
          status: AgentRunStatus.PENDING,
          threadId: acknowledgement.threadId,
        }),
        update: {},
      }),
    );
    expect(queueService.queueRun).toHaveBeenCalledWith(
      expect.objectContaining({
        clientRequestId: acknowledgement.clientRequestId,
        encryptedAuthToken: 'encrypted-token',
        kind: 'agent-chat-turn',
        request: expect.objectContaining({
          content: 'Generate an image of a lighthouse',
        }),
        runId: acknowledgement.runId,
        threadId: acknowledgement.threadId,
      }),
    );
    expect(agentMessagesService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        content: 'Generate an image of a lighthouse',
        id: acknowledgement.runId,
        organizationId: 'org-1',
        room: acknowledgement.threadId,
        userId: 'user-1',
      }),
    );
  });

  it('returns the same durable identities and re-reserves the same queue job when an acknowledgement is retried', async () => {
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
        runId: first.runId,
        threadId: first.threadId,
      }),
    );
    expect(prisma.agentRun.upsert).toHaveBeenCalledTimes(2);
    expect(queueService.queueRun).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ runId: first.runId }),
    );
  });

  it('recovers the active thread created by a concurrent acknowledgement', async () => {
    prisma.agentThread.upsert.mockRejectedValueOnce({ code: 'P2002' });
    prisma.agentThread.findFirst.mockResolvedValueOnce({
      brandId: 'brand-1',
      contextVersion: 1,
      id: 'winning-thread',
      status: 'ACTIVE',
    });

    await expect(
      service.accept(
        { clientRequestId: 'concurrent-thread', content: 'Continue safely' },
        { organizationId: 'org-1', userId: 'user-1' },
      ),
    ).resolves.toEqual(
      expect.objectContaining({ contextVersion: 1, status: 'queued' }),
    );
  });

  it('recovers the active run created by a concurrent acknowledgement', async () => {
    prisma.agentRun.upsert.mockRejectedValueOnce({ code: 'P2002' });
    prisma.agentRun.findFirst.mockResolvedValueOnce({
      metadata: {},
      status: AgentRunStatus.PENDING,
    });

    await expect(
      service.accept(
        { clientRequestId: 'concurrent-run', content: 'Continue safely' },
        { organizationId: 'org-1', userId: 'user-1' },
      ),
    ).resolves.toEqual(expect.objectContaining({ status: 'queued' }));
  });

  it('marks the accepted run failed when the durable queue reservation cannot be persisted', async () => {
    queueService.queueRun.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(
      service.accept(
        { clientRequestId: 'enqueue-failure', content: 'Generate safely' },
        { organizationId: 'org-1', userId: 'user-1' },
      ),
    ).rejects.toThrow('redis unavailable');

    expect(prisma.agentRun.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: AgentRunStatus.FAILED }),
      where: expect.objectContaining({
        isDeleted: false,
        organizationId: 'org-1',
      }),
    });
    expect(agentMessagesService.addMessage).toHaveBeenCalledOnce();
  });

  it('restores an enqueue-failed run before an idempotent acknowledgement retry', async () => {
    prisma.agentRun.upsert.mockImplementationOnce(({ create }) =>
      Promise.resolve({
        ...create,
        metadata: { ...create.metadata, requestState: 'enqueue_failed' },
        status: AgentRunStatus.FAILED,
      }),
    );

    await service.accept(
      { clientRequestId: 'enqueue-retry', content: 'Generate safely' },
      { organizationId: 'org-1', userId: 'user-1' },
    );

    expect(prisma.agentRun.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        completedAt: null,
        error: null,
        status: AgentRunStatus.PENDING,
      }),
      where: expect.objectContaining({
        isDeleted: false,
        organizationId: 'org-1',
        status: AgentRunStatus.FAILED,
      }),
    });
    expect(queueService.queueRun).toHaveBeenCalledOnce();
  });

  it('rejects a reused client request identity when the accepted payload changed', async () => {
    prisma.agentRun.upsert.mockResolvedValueOnce({
      metadata: { requestHash: 'sha256:v1:accepted-request' },
    });

    await expect(
      service.accept(
        {
          clientRequestId: '018f6f76-b821-7a51-82af-93d0ecac2101',
          content: 'A different request using the same identity',
        },
        { organizationId: 'org-1', userId: 'user-1' },
      ),
    ).rejects.toThrow('clientRequestId was already used for another turn');
    expect(queueService.queueRun).not.toHaveBeenCalled();
  });

  it('does not re-execute a terminal run when a late acknowledgement retry arrives', async () => {
    prisma.agentRun.upsert.mockImplementationOnce(({ create }) =>
      Promise.resolve({ ...create, status: AgentRunStatus.COMPLETED }),
    );

    const acknowledgement = await service.accept(
      {
        clientRequestId: '018f6f76-b821-7a51-82af-93d0ecac2103',
        content: 'Generate the already completed turn',
      },
      { organizationId: 'org-1', userId: 'user-1' },
    );

    expect(acknowledgement.runId).toEqual(expect.any(String));
    expect(queueService.queueRun).not.toHaveBeenCalled();
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
});
