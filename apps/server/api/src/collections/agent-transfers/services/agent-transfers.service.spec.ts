import type { CreateAgentTransferDto } from '@api/collections/agent-transfers/dto/create-agent-transfer.dto';
import { AgentTransfersService } from '@api/collections/agent-transfers/services/agent-transfers.service';
import type { AgentInitiatingPrincipal } from '@api/services/agent-orchestrator/utils/agent-initiating-principal.util';
import {
  AgentThreadStatus,
  AgentTransferDeliveryMode,
  AgentTransferStatus,
} from '@genfeedai/contracts';

describe('AgentTransfersService accepted turns (#6689)', () => {
  const principal: AgentInitiatingPrincipal = {
    isApiKey: false,
    organizationId: 'org-1',
    scopes: [],
    userId: 'user-1',
  };
  const forgedPrincipal: AgentInitiatingPrincipal = {
    isApiKey: false,
    organizationId: 'org-1',
    scopes: ['admin'],
    userId: 'attacker',
  };

  const thread = (id: string) => ({
    brandId: null,
    contextVersion: 1,
    id,
    status: AgentThreadStatus.ACTIVE,
    title: id,
  });
  const failedTransfer = {
    artifactReferences: [],
    artifactVersionPinIds: [],
    content: 'Run this',
    deliveryMode: AgentTransferDeliveryMode.SEND_AND_RUN,
    destinationThreadId: 'destination-1',
    id: 'transfer-1',
    idempotencyKey: 'idem-1',
    organizationId: 'org-1',
    sourceThreadId: 'source-1',
    status: AgentTransferStatus.FAILED,
    userId: 'user-1',
  };

  let accept: ReturnType<typeof vi.fn>;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    agentMessage: { create: ReturnType<typeof vi.fn> };
    agentThread: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    agentTransfer: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    workflowExecution: { findFirst: ReturnType<typeof vi.fn> };
  };
  let service: AgentTransfersService;

  beforeEach(() => {
    accept = vi.fn().mockResolvedValue({
      executionId: 'execution-1',
      queuedAt: '2026-10-11T10:00:00.000Z',
    });
    prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
      agentMessage: { create: vi.fn() },
      agentThread: {
        create: vi.fn(),
        findFirst: vi
          .fn()
          .mockImplementation(async ({ where }) => thread(where.id)),
      },
      agentTransfer: {
        create: vi.fn().mockResolvedValue({ id: 'transfer-1' }),
        findFirst: vi.fn().mockResolvedValue(failedTransfer),
        updateMany: vi.fn(),
      },
      workflowExecution: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    service = new AgentTransfersService(
      prisma as never,
      {} as never,
      { accept } as never,
    );
  });

  function acceptedContext() {
    expect(accept).toHaveBeenCalledOnce();
    return accept.mock.calls[0]?.[1];
  }

  it('queues a retried transfer under the principal of the user who retries it', async () => {
    await service.retry('transfer-1', {
      initiatingPrincipal: principal,
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(acceptedContext()).toEqual({
      initiatingPrincipal: principal,
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('queues a send-and-run transfer under the principal of the user who accepts it', async () => {
    prisma.agentTransfer.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        ...failedTransfer,
        status: AgentTransferStatus.PENDING,
      });

    await service.create(
      {
        content: 'Run this',
        deliveryMode: AgentTransferDeliveryMode.SEND_AND_RUN,
        destinationThreadId: 'destination-1',
        explicitUserIntent: true,
        idempotencyKey: 'idem-1',
        sourceThreadId: 'source-1',
      },
      {
        initiatingPrincipal: principal,
        organizationId: 'org-1',
        userId: 'user-1',
      },
    );

    expect(acceptedContext()).toMatchObject({
      initiatingPrincipal: principal,
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('never reads a principal from the transfer request body', async () => {
    prisma.agentTransfer.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        ...failedTransfer,
        status: AgentTransferStatus.PENDING,
      });

    await service.create(
      {
        content: 'Run this',
        deliveryMode: AgentTransferDeliveryMode.SEND_AND_RUN,
        destinationThreadId: 'destination-1',
        explicitUserIntent: true,
        idempotencyKey: 'idem-1',
        initiatingPrincipal: forgedPrincipal,
        scheduleInitiatingActor: forgedPrincipal,
        sourceThreadId: 'source-1',
      } as unknown as CreateAgentTransferDto,
      {
        initiatingPrincipal: principal,
        organizationId: 'org-1',
        userId: 'user-1',
      },
    );

    expect(acceptedContext().initiatingPrincipal).toEqual(principal);
    expect(JSON.stringify(accept.mock.calls)).not.toContain('attacker');
  });

  it('queues a caller without a principal unbound instead of inferring one from the transfer owner', async () => {
    await service.retry('transfer-1', {
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(acceptedContext()).toEqual({
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });
});
