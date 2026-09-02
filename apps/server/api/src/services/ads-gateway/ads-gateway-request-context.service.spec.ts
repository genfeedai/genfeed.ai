import { testId } from '@helpers/testing/test-id.helper';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  extractRequestContext: vi.fn(() => ({
    organizationId: 'corg000000000000000000001',
    userId: 'cuser000000000000000000001',
  })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AdsGatewayRequestContextService } from '@api/services/ads-gateway/ads-gateway-request-context.service';
import {
  CredentialPlatform,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

describe('AdsGatewayRequestContextService', () => {
  let service: AdsGatewayRequestContextService;
  let credentialsService: { findOne: ReturnType<typeof vi.fn> };

  const user = {
    id: 'user_authProvider_123',
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;
  const credentialId = testId('credential');

  beforeEach(() => {
    credentialsService = {
      findOne: vi.fn().mockResolvedValue({ accessToken: 'token-abc' }),
    };
    service = new AdsGatewayRequestContextService(
      credentialsService as unknown as CredentialsService,
    );
  });

  it.each(['meta', 'google', 'tiktok', 'x'] as const)(
    'accepts the supported %s platform',
    (platform) => {
      expect(service.validatePlatform(platform)).toBe(platform);
    },
  );

  it('rejects unsupported platforms with the existing error', () => {
    expect(() => service.validatePlatform('snapchat')).toThrow(
      new BadRequestException(
        'Invalid platform: snapchat. Must be one of: meta, google, tiktok, x',
      ),
    );
    expect(credentialsService.findOne).not.toHaveBeenCalled();
  });

  it.each([
    ['meta', CredentialPlatform.FACEBOOK],
    ['google', CredentialPlatform.GOOGLE_ADS],
    ['tiktok', CredentialPlatform.TIKTOK],
    ['x', CredentialPlatform.X_ADS],
  ] as const)(
    'resolves %s credentials from the connected tenant-scoped provider row',
    async (platform, credentialPlatform) => {
      credentialsService.findOne.mockResolvedValue({
        accessToken: EncryptionUtil.encrypt('access-token'),
        accessTokenSecret:
          platform === 'x'
            ? EncryptionUtil.encrypt('access-token-secret')
            : undefined,
      });

      await service.createAdapterContext(user, platform, {
        adAccountId: 'act-123',
        credentialId,
      });

      expect(credentialsService.findOne).toHaveBeenCalledWith({
        id: credentialId,
        isConnected: true,
        isDeleted: false,
        organizationId: 'corg000000000000000000001',
        platform: toPrismaCredentialPlatform(credentialPlatform),
      });
    },
  );

  it('decrypts credentials and returns only the bounded adapter context', async () => {
    credentialsService.findOne.mockResolvedValue({
      accessToken: EncryptionUtil.encrypt('x-access-token'),
      accessTokenSecret: EncryptionUtil.encrypt('x-access-token-secret'),
      developerToken: 'must-not-leak',
      refreshToken: 'must-not-leak',
    });

    const context = await service.createAdapterContext(user, 'x', {
      adAccountId: 'act-123',
      credentialId,
      loginCustomerId: 'login-customer-123',
    });

    expect(context).toEqual({
      accessToken: 'x-access-token',
      accessTokenSecret: 'x-access-token-secret',
      adAccountId: 'act-123',
      brandId: undefined,
      credentialId,
      loginCustomerId: 'login-customer-123',
      organizationId: 'corg000000000000000000001',
    });
  });

  it.each([
    [null, `Credential ${credentialId} not found or missing access token`],
    [
      { accessToken: null },
      `Credential ${credentialId} not found or missing access token`,
    ],
  ])(
    'rejects missing credential access with the existing error',
    async (row, message) => {
      credentialsService.findOne.mockResolvedValue(row);

      await expect(
        service.createAdapterContext(user, 'meta', {
          adAccountId: 'act-123',
          credentialId,
        }),
      ).rejects.toThrow(new UnauthorizedException(message));
    },
  );

  it('requires the OAuth 1.0a token secret for X Ads', async () => {
    credentialsService.findOne.mockResolvedValue({
      accessToken: EncryptionUtil.encrypt('x-access-token'),
      accessTokenSecret: null,
    });

    await expect(
      service.createAdapterContext(user, 'x', {
        adAccountId: 'act-123',
        credentialId,
      }),
    ).rejects.toThrow(
      new UnauthorizedException(
        `Credential ${credentialId} not found or missing access token secret`,
      ),
    );
  });
});
