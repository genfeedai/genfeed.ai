vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((value: string) => `decrypted:${value}`) },
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { MastodonController } from '@api/services/integrations/mastodon/controllers/mastodon.controller';
import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('MastodonController', () => {
  let controller: MastodonController;

  const mastodonService = {
    exchangeCodeForToken: vi.fn(),
    generateAuthUrl: vi.fn(),
    registerApp: vi.fn(),
    verifyCredentials: vi.fn(),
  };
  const brandsService = {
    findOne: vi.fn().mockResolvedValue({
      id: 'brand-id',
      organizationId: 'organization-id',
      userId: 'user-id',
    }),
  };
  const credentialsService = {
    beginOAuthForBrand: vi.fn().mockResolvedValue({
      credential: { id: 'credential-id' },
      state: 'opaque-oauth-state',
    }),
    findPendingOAuthCredential: vi.fn(),
    patch: vi.fn(),
    updateExternalProfile: vi.fn(),
  };
  const user = {
    organizationId: 'organization-id',
    userId: 'user-id',
  } as unknown as User;

  beforeEach(async () => {
    vi.clearAllMocks();
    mastodonService.registerApp.mockResolvedValue({
      client_id: 'client-id',
      client_secret: 'client-secret',
      id: 'app-id',
      name: 'Genfeed.ai',
      redirect_uri: 'https://app.genfeed.ai/oauth/mastodon',
    });
    mastodonService.generateAuthUrl.mockReturnValue(
      'https://mastodon.social/oauth/authorize?...',
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MastodonController],
      providers: [
        { provide: MastodonService, useValue: mastodonService },
        { provide: LoggerService, useValue: { log: vi.fn() } },
        {
          provide: ConfigService,
          useValue: { get: vi.fn(() => 'https://app.genfeed.ai') },
        },
        { provide: BrandsService, useValue: brandsService },
        { provide: CredentialsService, useValue: credentialsService },
      ],
    }).compile();

    controller = module.get(MastodonController);
  });

  it('registers the instance app and starts credential-bound OAuth', async () => {
    const result = await controller.connect({} as never, user, {
      brandId: 'brand-id',
      instanceUrl: 'mastodon.social',
    });

    expect(mastodonService.registerApp).toHaveBeenCalledWith(
      'mastodon.social',
      'https://app.genfeed.ai/oauth/mastodon',
    );
    expect(credentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'brand-id' }),
      'user-id',
      'mastodon',
      expect.objectContaining({
        oauthToken: 'client-id',
        oauthTokenSecret: 'client-secret',
      }),
    );
    expect(mastodonService.generateAuthUrl).toHaveBeenCalledWith(
      'mastodon.social',
      'client-id',
      'https://app.genfeed.ai/oauth/mastodon',
      'opaque-oauth-state',
    );
    expect(result).toEqual({
      url: 'https://mastodon.social/oauth/authorize?...',
    });
  });

  it('exchanges the code and persists the verified account', async () => {
    credentialsService.findPendingOAuthCredential.mockResolvedValue({
      brandId: 'brand-id',
      description: 'mastodon.social',
      id: 'credential-id',
      oauthToken: 'encrypted-client-id',
      oauthTokenSecret: 'encrypted-client-secret',
      organizationId: 'organization-id',
      userId: 'user-id',
    });
    mastodonService.exchangeCodeForToken.mockResolvedValue({
      accessToken: 'mastodon-token',
    });
    mastodonService.verifyCredentials.mockResolvedValue({
      acct: 'creator@mastodon.social',
      avatar: 'https://mastodon.social/avatar.png',
      display_name: 'Creator',
      id: 'mastodon-user',
      username: 'creator',
    });
    credentialsService.patch.mockResolvedValue({ id: 'credential-id' });
    credentialsService.updateExternalProfile.mockResolvedValue({
      id: 'credential-id',
      isConnected: true,
    });

    const result = await controller.verify({} as never, {
      code: 'auth-code',
      state: 'opaque-oauth-state',
    });

    expect(mastodonService.exchangeCodeForToken).toHaveBeenCalledWith(
      'mastodon.social',
      'decrypted:encrypted-client-id',
      'decrypted:encrypted-client-secret',
      'auth-code',
      'https://app.genfeed.ai/oauth/mastodon',
    );
    expect(credentialsService.patch).toHaveBeenCalledWith(
      'credential-id',
      expect.objectContaining({
        accessToken: 'mastodon-token',
        oauthState: null,
        oauthToken: null,
        oauthTokenSecret: null,
      }),
    );
    expect(result).toEqual({ id: 'credential-id', isConnected: true });
  });
});
