import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { CredentialPlatform } from '@genfeedai/enums';

describe('AccountPublishingContextService', () => {
  const credentialId = 'cred-1';
  const organizationId = 'org-1';
  const brandId = 'brand-1';
  const credentialsService = {
    findOne: vi.fn(),
  };
  const accountHealthService = {
    assessCredentialHealth: vi.fn(),
  };
  const prisma = {
    brand: {
      findFirst: vi.fn(),
    },
    post: {
      findMany: vi.fn(),
    },
  };
  const logger = {
    debug: vi.fn(),
  };
  const service = new AccountPublishingContextService(
    accountHealthService as unknown as AccountHealthService,
    credentialsService as never,
    prisma as never,
    logger as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    credentialsService.findOne.mockResolvedValue({
      id: credentialId,
      accessToken: 'secret-token',
      brand: brandId,
      externalHandle: 'vincent',
      isConnected: true,
      isDeleted: false,
      label: 'Founder X',
      oauthToken: 'oauth-secret',
      organization: organizationId,
      platform: CredentialPlatform.TWITTER,
      refreshToken: 'refresh-secret',
    });
    accountHealthService.assessCredentialHealth.mockResolvedValue({
      credentialId,
      holdPublishing: true,
      holdReason: 'twitter publishing is held for warmup.',
      label: 'Founder X',
      override: { isActive: false },
      platform: CredentialPlatform.TWITTER,
      riskLevel: 'medium',
      score: 56,
      signals: {
        connectedDays: 1,
        profileSignals: 2,
        publishedPosts: 0,
        recentFailures: 0,
      },
      state: 'warming',
      thresholds: {
        maxRecentFailures: 0,
        minConnectedDays: 10,
        minProfileSignals: 2,
        minPublishedPosts: 4,
      },
    });
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: { replyStyle: 'direct' },
      description: 'AI content OS',
      id: brandId,
      label: 'Genfeed',
      slug: 'genfeed',
      text: 'Direct, useful, technical.',
    });
    prisma.post.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        description: 'Recent X post',
        id: 'post-1',
        label: 'Recent',
        platform: CredentialPlatform.TWITTER,
        status: 'DRAFT',
      },
    ]);
  });

  it('resolves credentials with strict organization and brand guards', async () => {
    await service.resolve({
      brandId,
      credentialId,
      organizationId,
      surface: 'post',
    });

    expect(credentialsService.findOne).toHaveBeenCalledWith({
      _id: credentialId,
      brand: brandId,
      isConnected: true,
      isDeleted: false,
      organization: organizationId,
    });
    expect(accountHealthService.assessCredentialHealth).toHaveBeenCalledWith({
      brandId,
      credentialId,
      organizationId,
    });
  });

  it('throws when the guarded credential is missing', async () => {
    credentialsService.findOne.mockResolvedValueOnce(null);

    await expect(
      service.resolve({
        brandId,
        credentialId,
        organizationId,
        surface: 'post',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns account context without credential token fields', async () => {
    const context = await service.resolve({
      brandId,
      credentialId,
      organizationId,
      surface: 'post',
    });

    const serialized = JSON.stringify(context);
    expect(context.account).toEqual(
      expect.objectContaining({
        handle: 'vincent',
        id: credentialId,
        label: 'Founder X',
        platform: CredentialPlatform.TWITTER,
      }),
    );
    expect(context.accountHealth?.state).toBe('warming');
    expect(context.promptHints).toContain(
      'Account warmup: warming (medium risk, score 56)',
    );
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('oauth-secret');
    expect(serialized).not.toContain('refresh-secret');
  });

  it('marks X Articles as copy-only rich-copy surfaces', async () => {
    const context = await service.resolve({
      brandId,
      credentialId,
      organizationId,
      surface: 'x-article',
    });

    expect(context.publishability).toBe('copy_only');
    expect(context.constraints.supportsDirectPublishing).toBe(false);
    expect(context.constraints.supportsRichArticleCopy).toBe(true);
  });
});
