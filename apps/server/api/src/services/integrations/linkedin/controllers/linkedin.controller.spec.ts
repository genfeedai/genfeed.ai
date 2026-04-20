vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((payload: Record<string, string>) => ({
    errors: [payload],
  })),
  returnInternalServerError: vi.fn((msg: string) => ({
    errors: [{ detail: msg }],
  })),
  returnNotFound: vi.fn((type: string, id: string) => ({
    errors: [{ detail: `${type} ${id} not found` }],
  })),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LinkedInController } from '@api/services/integrations/linkedin/controllers/linkedin.controller';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('LinkedInController', () => {
  let controller: LinkedInController;
  let brandsService: BrandsService;
  let credentialsService: CredentialsService;
  let linkedInService: LinkedInService;

  const mockBrandsService = { findOne: vi.fn() };
  const mockCredentialsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    saveCredentials: vi.fn(),
  };
  const mockLinkedInService = {
    exchangeAuthCodeForAccessToken: vi.fn(),
    generateAuthUrl: vi.fn(),
    getUserProfile: vi.fn(),
  };
  const mockLoggerService = { error: vi.fn(), log: vi.fn() };

  const brandId = 'test-object-id';
  const orgId = 'test-object-id';
  const userId = 'test-object-id';
  const mockUser = {
    publicMetadata: {
      organization: orgId.toString(),
      user: userId.toString(),
    },
  };
  const mockRequest = {} as Request;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinkedInController],
      providers: [
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: BrandsService, useValue: mockBrandsService },
        { provide: CredentialsService, useValue: mockCredentialsService },
        { provide: LinkedInService, useValue: mockLinkedInService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LinkedInController>(LinkedInController);
    brandsService = module.get<BrandsService>(BrandsService);
    credentialsService = module.get<CredentialsService>(CredentialsService);
    linkedInService = module.get<LinkedInService>(LinkedInService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    it('should save credentials and return auth URL', async () => {
      const brand = { _id: brandId, organization: orgId };
      mockBrandsService.findOne.mockResolvedValue(brand);
      mockCredentialsService.saveCredentials.mockResolvedValue({});
      mockLinkedInService.generateAuthUrl.mockReturnValue(
        'https://linkedin.com/oauth/authorize?...',
      );

      const result = await controller.connect(
        mockRequest,
        mockUser as unknown as import('@clerk/backend').User,
        { brand: brandId },
      );

      expect(result.data).toHaveProperty('url');
      expect(mockCredentialsService.saveCredentials).toHaveBeenCalled();
      expect(mockLinkedInService.generateAuthUrl).toHaveBeenCalled();
    });

    it('should return bad request when brand not found', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      const result = await controller.connect(
        mockRequest,
        mockUser as unknown as import('@clerk/backend').User,
        { brand: brandId },
      );

      expect(result).toHaveProperty('errors');
    });

    it('should return internal error when OAuth init fails', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        _id: brandId,
        organization: orgId,
      });
      mockCredentialsService.saveCredentials.mockRejectedValue(
        new Error('DB error'),
      );

      const result = await controller.connect(
        mockRequest,
        mockUser as unknown as import('@clerk/backend').User,
        { brand: brandId },
      );

      expect(result).toHaveProperty('errors');
    });
  });

  describe('verify', () => {
    it('should exchange code, get profile, and update credential', async () => {
      const credId = 'test-object-id';
      const state = JSON.stringify({
        brandId: brandId.toString(),
        organizationId: orgId.toString(),
      });

      mockLinkedInService.exchangeAuthCodeForAccessToken.mockResolvedValue({
        accessToken: 'linkedin-token',
        expiresIn: 5184000,
      });
      mockLinkedInService.getUserProfile.mockResolvedValue({
        email: 'john@example.com',
        firstName: 'John',
        id: 'li-user-123',
        lastName: 'Doe',
      });
      mockCredentialsService.findOne.mockResolvedValue({ _id: credId });
      mockCredentialsService.patch.mockResolvedValue({
        _id: credId,
        isConnected: true,
      });

      const result = await controller.verify(mockRequest, {
        code: 'auth-code',
        state,
      });

      expect(result.data).toEqual({ _id: credId, isConnected: true });
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        credId,
        expect.objectContaining({
          accessToken: 'linkedin-token',
          externalHandle: 'John Doe',
          externalId: 'li-user-123',
          isConnected: true,
          isDeleted: false,
        }),
      );
    });

    it('should return bad request when code or state is missing', async () => {
      const result = await controller.verify(mockRequest, {});

      expect(result).toHaveProperty('errors');
    });

    it('should return not found when credential does not exist', async () => {
      const state = JSON.stringify({
        brandId: brandId.toString(),
        organizationId: orgId.toString(),
      });
      mockLinkedInService.exchangeAuthCodeForAccessToken.mockResolvedValue({
        accessToken: 'token',
        expiresIn: 3600,
      });
      mockLinkedInService.getUserProfile.mockResolvedValue({
        email: 'a@b.com',
        firstName: 'A',
        id: '1',
        lastName: 'B',
      });
      mockCredentialsService.findOne.mockResolvedValue(null);

      const result = await controller.verify(mockRequest, {
        code: 'code',
        state,
      });

      expect(result).toHaveProperty('errors');
    });

    it('should return internal error on unexpected failure', async () => {
      const state = JSON.stringify({
        brandId: brandId.toString(),
        organizationId: orgId.toString(),
      });
      mockLinkedInService.exchangeAuthCodeForAccessToken.mockRejectedValue(
        new Error('Network error'),
      );

      const result = await controller.verify(mockRequest, {
        code: 'code',
        state,
      });

      expect(result).toHaveProperty('errors');
    });

    it('should rethrow HttpException from service', async () => {
      const state = JSON.stringify({
        brandId: brandId.toString(),
        organizationId: orgId.toString(),
      });
      mockLinkedInService.exchangeAuthCodeForAccessToken.mockRejectedValue(
        new HttpException('Forbidden', 403),
      );

      await expect(
        controller.verify(mockRequest, { code: 'code', state }),
      ).rejects.toThrow(HttpException);
    });
  });
});
