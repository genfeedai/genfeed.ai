vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();

  return {
    ...actual,
    serializeCollection: vi.fn((_, __, result) => result),
    serializeSingle: vi.fn((_, __, data) => data),
  };
});

import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ThreadsController } from '@api/services/integrations/threads/controllers/threads.controller';
import { CredentialPlatform } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BrandsService } from '@server/collections/brands/services/brands.service';
import { CredentialsService } from '@server/collections/credentials/services/credentials.service';
import { ThreadsService } from '@server/services/integrations/threads/services/threads.service';
import { of } from 'rxjs';

describe('ThreadsController', () => {
  let controller: ThreadsController;
  let brandsService: BrandsService;
  let threadsService: ThreadsService;

  const mockBrandId = testId('brand');
  const mockOrganizationId = testId('org');
  const mockUserId = testId('user');

  const mockRequest = {} as never;
  const mockUser = {
    brandId: mockBrandId,
    id: 'auth-provider-user',
    organizationId: mockOrganizationId,
    userId: mockUserId,
  } as never;

  const mockBrandsService = { findOne: vi.fn() };
  const mockCredentialsService = {
    beginOAuthForBrand: vi.fn(),
    findPendingOAuthCredential: vi.fn(),
    patch: vi.fn(),
    updateExternalProfile: vi.fn(),
  };
  const mockHttpService = { get: vi.fn(), post: vi.fn() };
  const mockThreadsService = {
    getAccountDetails: vi.fn(),
    getTrends: vi.fn(),
  };
  const mockLoggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  let configValues: Record<string, string | undefined>;
  const mockConfigService = {
    get: vi.fn((key: string) => configValues[key]),
  };

  beforeEach(async () => {
    configValues = {
      THREADS_API_VERSION: 'v1.0',
      THREADS_CLIENT_ID: 'threads-client-id',
      THREADS_CLIENT_SECRET: 'threads-client-secret',
      THREADS_REDIRECT_URI: 'https://app.genfeed.ai/oauth/threads',
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ThreadsController],
      providers: [
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: BrandsService,
          useValue: mockBrandsService,
        },
        {
          provide: CredentialsService,
          useValue: mockCredentialsService,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ThreadsService,
          useValue: mockThreadsService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ThreadsController>(ThreadsController);
    brandsService = module.get<BrandsService>(BrandsService);
    threadsService = module.get<ThreadsService>(ThreadsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getConnectReadiness', () => {
    it('reports available when the same OAuth configuration used by connect is ready', () => {
      expect(controller.getConnectReadiness()).toEqual({
        status: 'available',
      });
    });

    it.each([
      ['THREADS_CLIENT_ID', undefined],
      ['THREADS_CLIENT_SECRET', '   '],
      ['THREADS_REDIRECT_URI', 'PLACEHOLDER_NOT_CONFIGURED'],
    ])('reports unavailable when %s is %s', (key, value) => {
      configValues[key] = value;

      expect(controller.getConnectReadiness()).toEqual({
        status: 'unavailable',
      });
    });
  });

  describe('connect', () => {
    it('should preserve bad request when brand not found', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.connect(mockRequest, mockUser, {
          brandId: mockBrandId,
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('should save credentials and return OAuth URL when brand found', async () => {
      const mockBrand = {
        id: mockBrandId,
        organizationId: mockOrganizationId,
        userId: mockUserId,
      };
      mockBrandsService.findOne.mockResolvedValue(mockBrand);
      mockCredentialsService.beginOAuthForBrand.mockResolvedValue({
        credential: { id: 'credential-id' },
        state: 'opaque-oauth-state',
      });

      const result = await controller.connect(mockRequest, mockUser, {
        brandId: mockBrandId,
      });

      expect(brandsService.findOne).toHaveBeenCalled();
      expect(mockCredentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
        mockBrand,
        mockUserId,
        CredentialPlatform.THREADS,
        expect.objectContaining({ isConnected: false }),
      );
      expect(result).toEqual({
        url:
          'https://threads.net/oauth/authorize' +
          '?client_id=threads-client-id' +
          '&redirect_uri=https%3A%2F%2Fapp.genfeed.ai%2Foauth%2Fthreads' +
          '&scope=threads_basic%2Cthreads_content_publish%2Cthreads_manage_insights%2Cthreads_manage_replies%2Cthreads_read_replies' +
          '&response_type=code&state=opaque-oauth-state',
      });
    });

    it.each([
      ['THREADS_CLIENT_ID', undefined],
      ['THREADS_CLIENT_SECRET', undefined],
      ['THREADS_REDIRECT_URI', undefined],
      ['THREADS_CLIENT_ID', '   '],
      ['THREADS_CLIENT_SECRET', '   '],
      ['THREADS_REDIRECT_URI', '   '],
      ['THREADS_CLIENT_ID', 'PLACEHOLDER_NOT_CONFIGURED'],
      ['THREADS_CLIENT_SECRET', 'PLACEHOLDER_NOT_CONFIGURED'],
      ['THREADS_REDIRECT_URI', 'PLACEHOLDER_NOT_CONFIGURED'],
    ])(
      'fails closed before pending OAuth state when %s is %s',
      async (key, value) => {
        const mockBrand = {
          id: mockBrandId,
          organizationId: mockOrganizationId,
          userId: mockUserId,
        };
        configValues[key] = value;
        mockBrandsService.findOne.mockResolvedValue(mockBrand);

        await expect(
          controller.connect(mockRequest, mockUser, {
            brandId: mockBrandId,
          }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);

        expect(
          mockCredentialsService.beginOAuthForBrand,
        ).not.toHaveBeenCalled();
      },
    );

    it('does not expose missing configuration details in the error', async () => {
      configValues.THREADS_CLIENT_SECRET = undefined;
      mockBrandsService.findOne.mockResolvedValue({
        id: mockBrandId,
        organizationId: mockOrganizationId,
        userId: mockUserId,
      });

      const failure = await controller
        .connect(mockRequest, mockUser, { brandId: mockBrandId })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect((failure as Error).message).toBe(
        'Threads OAuth is not configured for this deployment.',
      );
      expect((failure as Error).message).not.toContain('THREADS_CLIENT_SECRET');
    });

    it('trims configured values before building the provider URL', async () => {
      configValues.THREADS_CLIENT_ID = '  threads-client-id  ';
      configValues.THREADS_CLIENT_SECRET = '  threads-client-secret  ';
      configValues.THREADS_REDIRECT_URI =
        '  https://app.genfeed.ai/oauth/threads  ';
      mockBrandsService.findOne.mockResolvedValue({
        id: mockBrandId,
        organizationId: mockOrganizationId,
        userId: mockUserId,
      });
      mockCredentialsService.beginOAuthForBrand.mockResolvedValue({
        state: 'opaque-oauth-state',
      });

      const result = await controller.connect(mockRequest, mockUser, {
        brandId: mockBrandId,
      });

      expect(result).toEqual({
        url:
          'https://threads.net/oauth/authorize' +
          '?client_id=threads-client-id' +
          '&redirect_uri=https%3A%2F%2Fapp.genfeed.ai%2Foauth%2Fthreads' +
          '&scope=threads_basic%2Cthreads_content_publish%2Cthreads_manage_insights%2Cthreads_manage_replies%2Cthreads_read_replies' +
          '&response_type=code&state=opaque-oauth-state',
      });
    });
  });

  describe('verify', () => {
    it('preserves bad request when callback identifiers are missing', async () => {
      await expect(controller.verify(mockRequest, {})).rejects.toMatchObject({
        status: 400,
      });
    });

    it('preserves not found when pending OAuth state does not exist', async () => {
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue(null);

      await expect(
        controller.verify(mockRequest, {
          code: 'auth-code',
          state: 'missing-state',
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('fails closed when the redirect URI is unavailable before token exchange', async () => {
      configValues.THREADS_REDIRECT_URI = 'PLACEHOLDER_NOT_CONFIGURED';
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        brandId: 'brand-id',
        id: 'credential-id',
        organizationId: 'organization-id',
        userId: 'user-id',
      });

      await expect(
        controller.verify(mockRequest, {
          code: 'auth-code',
          state: 'opaque-oauth-state',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(mockHttpService.post).not.toHaveBeenCalled();
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it('resolves tenant ownership from the pending OAuth state', async () => {
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        brandId: 'brand-id',
        id: 'credential-id',
        organizationId: 'organization-id',
        userId: 'user-id',
      });
      mockHttpService.post.mockReturnValue(
        of({ data: { access_token: 'short-token', user_id: 'threads-user' } }),
      );
      mockHttpService.get.mockReturnValue(
        of({ data: { access_token: 'long-token', expires_in: 3600 } }),
      );
      mockThreadsService.getAccountDetails.mockResolvedValue({
        id: 'threads-user',
        threads_profile_picture_url: 'https://threads.example/avatar.jpg',
        username: 'threads-user',
      });
      mockCredentialsService.patch.mockResolvedValue({ id: 'credential-id' });
      mockCredentialsService.updateExternalProfile.mockResolvedValue({
        id: 'credential-id',
        isConnected: true,
      });

      const result = await controller.verify(mockRequest, {
        code: 'auth-code',
        state: 'opaque-oauth-state',
      });

      expect(
        mockCredentialsService.findPendingOAuthCredential,
      ).toHaveBeenCalledWith('opaque-oauth-state', CredentialPlatform.THREADS);
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        'credential-id',
        expect.objectContaining({
          accessToken: 'long-token',
          oauthState: null,
        }),
      );
      expect(mockCredentialsService.updateExternalProfile).toHaveBeenCalledWith(
        'credential-id',
        'organization-id',
        expect.any(Object),
      );
      expect(result).toEqual({ id: 'credential-id', isConnected: true });
    });
  });

  describe('getTrends', () => {
    it('should delegate to threads service', () => {
      const mockTrends = [{ topic: 'AI' }, { topic: 'Tech' }];
      mockThreadsService.getTrends.mockReturnValue(mockTrends);

      const result = controller.getTrends();

      expect(threadsService.getTrends).toHaveBeenCalled();
      expect(result).toEqual(mockTrends);
    });
  });
});
