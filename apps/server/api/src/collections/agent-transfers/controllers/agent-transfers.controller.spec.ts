import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentTransfersController } from '@api/collections/agent-transfers/controllers/agent-transfers.controller';
import type { CreateAgentTransferDto } from '@api/collections/agent-transfers/dto/create-agent-transfer.dto';
import { AgentTransferDeliveryMode } from '@genfeedai/contracts';
import type { Request } from 'express';

describe('AgentTransfersController accepting user (#6689)', () => {
  const request = {
    headers: {},
    url: '/agent/transfers',
  } as unknown as Request;
  const sessionUser = {
    brandId: 'brand-1',
    id: 'auth-1',
    isApiKey: false,
    organizationId: 'org-1',
    scopes: [],
    userId: 'user-1',
  } as unknown as AuthenticatedUser;
  const apiKeyUser = {
    ...sessionUser,
    apiKeyId: 'key-1',
    isApiKey: true,
    scopes: ['agents:write'],
  } as unknown as AuthenticatedUser;
  const body = {
    content: 'Run this',
    deliveryMode: AgentTransferDeliveryMode.SEND_AND_RUN,
    destinationThreadId: 'destination-1',
    explicitUserIntent: true,
    idempotencyKey: 'idem-1',
    sourceThreadId: 'source-1',
  } as CreateAgentTransferDto;

  let transfers: {
    create: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
  };
  let controller: AgentTransfersController;

  beforeEach(() => {
    transfers = {
      create: vi.fn().mockResolvedValue({ id: 'transfer-1' }),
      retry: vi.fn().mockResolvedValue({ id: 'transfer-1' }),
    };
    controller = new AgentTransfersController(
      transfers as never,
      {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as never,
    );
  });

  it('captures the authenticated session user as the accepting principal on create', async () => {
    await controller.create(request, body, sessionUser);

    expect(transfers.create).toHaveBeenCalledWith(body, {
      initiatingPrincipal: {
        isApiKey: false,
        organizationId: 'org-1',
        scopes: [],
        userId: 'user-1',
      },
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('captures the authenticated API key as the accepting principal on retry', async () => {
    await controller.retry(request, apiKeyUser, 'transfer-1');

    expect(transfers.retry).toHaveBeenCalledWith('transfer-1', {
      initiatingPrincipal: {
        apiKeyId: 'key-1',
        isApiKey: true,
        organizationId: 'org-1',
        scopes: ['agents:write'],
        userId: 'user-1',
      },
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('does not let the request body supply the principal', async () => {
    await controller.create(
      request,
      {
        ...body,
        initiatingPrincipal: {
          isApiKey: false,
          organizationId: 'org-1',
          scopes: [],
          userId: 'attacker',
        },
      } as unknown as CreateAgentTransferDto,
      sessionUser,
    );

    expect(transfers.create.mock.calls[0]?.[1].initiatingPrincipal).toEqual({
      isApiKey: false,
      organizationId: 'org-1',
      scopes: [],
      userId: 'user-1',
    });
  });
});
