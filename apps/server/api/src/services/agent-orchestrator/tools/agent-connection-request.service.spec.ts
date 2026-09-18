import { AgentConnectionRequestService } from '@api/services/agent-orchestrator/tools/agent-connection-request.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createService() {
  const credentialsService = {
    beginOAuthForBrand: vi.fn(),
    createPendingForBrand: vi.fn(),
    findOne: vi.fn(),
  };
  const brandsService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
  };
  const organizationsService = {
    findOne: vi.fn().mockResolvedValue({ slug: 'acme' }),
  };
  const configService = {
    get: vi.fn().mockReturnValue('https://app.genfeed.ai'),
  };
  const providerSetup = {
    resolveProviderSignals: vi.fn().mockReturnValue({ diagnostics: [] }),
  };
  const service = new AgentConnectionRequestService(
    credentialsService as never,
    brandsService as never,
    organizationsService as never,
    configService as never,
    providerSetup as never,
  );
  return {
    brandsService,
    credentialsService,
    providerSetup,
    service,
  };
}

const ctx = {
  organizationId: 'org-1',
  userId: 'user-1',
};

describe('AgentConnectionRequestService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts a pending connection with a token-free browser URL', async () => {
    const { brandsService, credentialsService, service } = createService();
    brandsService.findOne.mockResolvedValue({ id: 'brand-1', label: 'Acme' });
    credentialsService.beginOAuthForBrand.mockResolvedValue({
      credential: {
        brandId: 'brand-1',
        createdAt: new Date(),
        id: 'cred-1',
        isConnected: false,
        platform: 'TWITTER',
      },
      state: 'csrf-state',
    });

    const result = await service.start(
      { brandId: 'brand-1', platform: 'twitter' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.data?.connectionId).toBe('cred-1');
    expect(result.data?.state).toBe('pending');
    expect(String(result.data?.authorizationUrl)).toContain(
      '/acme/~/connect/social',
    );
    expect(String(result.data?.authorizationUrl)).not.toMatch(/oauth_token/);
  });

  it('rejects an unconfigured provider before creating a credential', async () => {
    const { credentialsService, providerSetup, service } = createService();
    providerSetup.resolveProviderSignals.mockReturnValue({
      diagnostics: [
        {
          correctiveAction: 'Set TWITTER_CLIENT_ID.',
          scope: 'provider',
          severity: 'error',
        },
      ],
    });

    const result = await service.start(
      { platform: CredentialPlatform.TWITTER },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.data?.state).toBe('failed');
    expect(credentialsService.beginOAuthForBrand).not.toHaveBeenCalled();
  });

  it('denies another tenant connection id', async () => {
    const { credentialsService, service } = createService();
    credentialsService.findOne.mockResolvedValue(null);

    const result = await service.status({ connectionId: 'cred-other' }, ctx);

    expect(result.success).toBe(false);
    expect(credentialsService.findOne).toHaveBeenCalledWith({
      id: 'cred-other',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('replays a completed request without creating another credential', async () => {
    const { credentialsService, service } = createService();
    credentialsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      createdAt: new Date(),
      externalId: 'acct-1',
      id: 'cred-1',
      isConnected: true,
      platform: 'TWITTER',
    });

    const result = await service.start(
      { connectionId: 'cred-1', platform: 'twitter' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.data?.state).toBe('authorized');
    expect(credentialsService.beginOAuthForBrand).not.toHaveBeenCalled();
  });
});
