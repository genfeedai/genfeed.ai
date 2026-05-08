import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { NotFoundException } from '@nestjs/common';

describe('AccountPublishingContextService', () => {
  const credentialId = 'cred-1';
  const organizationId = 'org-1';
  const brandId = 'brand-1';
  const credentialsService = {
    findOne: vi.fn(),
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
    credentialsService as never,
    prisma as never,
    logger as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    credentialsService.findOne.mockResolvedValue({
      _id: credentialId,
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
