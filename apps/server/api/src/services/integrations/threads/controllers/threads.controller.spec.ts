vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((data) => data),
  returnInternalServerError: vi.fn((msg) => msg),
  returnNotFound: vi.fn((name, id) => ({ id, name })),
  serializeCollection: vi.fn((_, __, r) => r),
  serializeSingle: vi.fn((_, __, data) => data),
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ThreadsController } from '@api/services/integrations/threads/controllers/threads.controller';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

describe('ThreadsController', () => {
  let controller: ThreadsController;
  let brandsService: BrandsService;
  let threadsService: ThreadsService;

  const mockRequest = {} as never;
  const mockUser = { id: 'user-123' } as never;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ThreadsController],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('test-value') },
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

  describe('connect', () => {
    it('should return bad request when brand not found', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      const result = await controller.connect(mockRequest, mockUser, {
        brandId: '507f1f77bcf86cd799439015',
      });

      expect(result).toEqual({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    });

    it('should save credentials and return OAuth URL when brand found', async () => {
      const mockBrand = {
        id: '507f1f77bcf86cd799439015',
        organizationId: '507f1f77bcf86cd799439011',
        userId: '507f1f77bcf86cd799439013',
      };
      mockBrandsService.findOne.mockResolvedValue(mockBrand);
      mockCredentialsService.beginOAuthForBrand.mockResolvedValue({
        credential: { id: 'credential-id' },
        state: 'opaque-oauth-state',
      });

      const result = await controller.connect(mockRequest, mockUser, {
        brandId: '507f1f77bcf86cd799439015',
      });

      expect(brandsService.findOne).toHaveBeenCalled();
      expect(mockCredentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
        mockBrand,
        '507f1f77bcf86cd799439013',
        CredentialPlatform.THREADS,
        expect.objectContaining({ isConnected: false }),
      );
      expect(result).toHaveProperty('url');
    });
  });

  describe('verify', () => {
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
