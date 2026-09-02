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
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LinkedInController } from '@api/services/integrations/linkedin/controllers/linkedin.controller';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { LinkedInAuthorizedSignalsService } from '@api/services/integrations/linkedin/services/linkedin-authorized-signals.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

async function expectHttpStatus(
  promise: Promise<unknown>,
  status: number,
): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const httpError = error as HttpException;
    expect(httpError.getStatus()).toBe(status);
    return httpError;
  }

  throw new Error('expected HttpException');
}

describe('LinkedInController', () => {
  let controller: LinkedInController;

  const mockBrandsService = { findOne: vi.fn() };
  const mockCredentialsService = {
    beginOAuthForBrand: vi.fn(),
    findOne: vi.fn(),
    findPendingOAuthCredential: vi.fn(),
    patch: vi.fn(),
    updateExternalProfile: vi.fn(),
  };
  const mockLinkedInService = {
    exchangeAuthCodeForAccessToken: vi.fn(),
    generateAuthUrl: vi.fn(),
    getUserProfile: vi.fn(),
  };
  const mockLinkedInAuthorizedSignalsService = {
    refresh: vi.fn().mockResolvedValue({ state: 'partial' }),
  };
  const mockLoggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

  const brandId = 'test-object-id';
  const orgId = 'test-object-id';
  const userId = 'test-object-id';
  const mockUser = {
    organizationId: orgId.toString(),
    userId: userId.toString(),
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
        {
          provide: LinkedInAuthorizedSignalsService,
          useValue: mockLinkedInAuthorizedSignalsService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LinkedInController>(LinkedInController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    it('should save credentials and return auth URL', async () => {
      const brand = { id: brandId, organizationId: orgId, userId };
      mockBrandsService.findOne.mockResolvedValue(brand);
      mockCredentialsService.beginOAuthForBrand.mockResolvedValue({
        credential: { id: 'credential-id' },
        state: 'opaque-oauth-state',
      });
      mockLinkedInService.generateAuthUrl.mockReturnValue(
        'https://linkedin.com/oauth/authorize?...',
      );

      const result = await controller.connect(
        mockRequest,
        mockUser as unknown as import('@api/auth/interfaces/authenticated-user.interface').AuthenticatedUser,
        { brandId },
      );

      expect(result.data).toHaveProperty('url');
      expect(mockCredentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
        brand,
        userId,
        'linkedin',
        { isConnected: false },
      );
      expect(mockLinkedInService.generateAuthUrl).toHaveBeenCalledWith(
        'opaque-oauth-state',
      );
    });

    it('should return bad request when brand not found', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      const result = await controller.connect(
        mockRequest,
        mockUser as unknown as import('@api/auth/interfaces/authenticated-user.interface').AuthenticatedUser,
        { brandId },
      );

      expect(result).toHaveProperty('errors');
    });

    it('should return internal error when OAuth init fails', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        id: brandId,
        organizationId: orgId,
        userId,
      });
      mockCredentialsService.beginOAuthForBrand.mockRejectedValue(
        new Error('DB error'),
      );

      const error = await expectHttpStatus(
        controller.connect(
          mockRequest,
          mockUser as unknown as import('@api/auth/interfaces/authenticated-user.interface').AuthenticatedUser,
          { brandId },
        ),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      expect(error.getResponse()).toEqual({
        detail: 'Failed to initiate LinkedIn OAuth',
        title: 'Internal Server Error',
      });
    });

    it('maps a missing LinkedIn client id to 503 instead of a catch-all 500', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        id: brandId,
        organizationId: orgId,
        userId,
      });
      mockCredentialsService.beginOAuthForBrand.mockResolvedValue({
        credential: { id: 'credential-id' },
        state: 'opaque-oauth-state',
      });
      mockLinkedInService.generateAuthUrl.mockImplementation(() => {
        throw new Error('The client ID must be specified.');
      });

      const error = await expectHttpStatus(
        controller.connect(
          mockRequest,
          mockUser as unknown as import('@api/auth/interfaces/authenticated-user.interface').AuthenticatedUser,
          { brandId },
        ),
        HttpStatus.SERVICE_UNAVAILABLE,
      );

      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          title: 'Integration not configured',
        }),
      );
    });

    it('rethrows provider HttpExceptions from connect instead of wrapping them as 500', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        id: brandId,
        organizationId: orgId,
        userId,
      });
      mockCredentialsService.beginOAuthForBrand.mockRejectedValue(
        new HttpException('Brand conflict', HttpStatus.CONFLICT),
      );

      await expectHttpStatus(
        controller.connect(
          mockRequest,
          mockUser as unknown as import('@api/auth/interfaces/authenticated-user.interface').AuthenticatedUser,
          { brandId },
        ),
        HttpStatus.CONFLICT,
      );
    });
  });

  describe('verify', () => {
    it('should exchange code, get profile, and update credential', async () => {
      const credId = 'test-object-id';
      const state = 'opaque-oauth-state';

      mockLinkedInService.exchangeAuthCodeForAccessToken.mockResolvedValue({
        accessToken: 'linkedin-token',
        expiresIn: 5184000,
        scope: 'openid profile w_member_social',
      });
      mockLinkedInService.getUserProfile.mockResolvedValue({
        email: 'john@example.com',
        firstName: 'John',
        id: 'li-user-123',
        lastName: 'Doe',
      });
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        brandId,
        id: credId,
        organizationId: orgId,
        userId,
      });
      mockCredentialsService.patch.mockResolvedValue({
        id: credId,
        isConnected: true,
      });
      mockCredentialsService.updateExternalProfile.mockResolvedValue({
        id: credId,
        isConnected: true,
      });

      const result = await controller.verify(mockRequest, {
        code: 'auth-code',
        state,
      });

      expect(result.data).toEqual({ id: credId, isConnected: true });
      expect(
        mockCredentialsService.findPendingOAuthCredential,
      ).toHaveBeenCalledWith('opaque-oauth-state', 'linkedin');
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        credId,
        expect.objectContaining({
          accessToken: 'linkedin-token',
          isConnected: true,
          isDeleted: false,
          oauthState: null,
          grantedScopes: ['openid', 'profile', 'w_member_social'],
          grantedScopesCapturedAt: expect.any(Date),
        }),
      );
      expect(mockCredentialsService.updateExternalProfile).toHaveBeenCalledWith(
        credId,
        orgId,
        expect.objectContaining({
          handle: 'John Doe',
          id: 'li-user-123',
          name: 'John Doe',
        }),
      );
      expect(mockLinkedInAuthorizedSignalsService.refresh).toHaveBeenCalledWith(
        {
          accessToken: 'linkedin-token',
          credentialId: credId,
          force: true,
          grantedScopes: ['openid', 'profile', 'w_member_social'],
          organizationId: orgId,
        },
      );
    });

    it('should return bad request when code or state is missing', async () => {
      const result = await controller.verify(mockRequest, {});

      expect(result).toHaveProperty('errors');
    });

    it('should return not found when credential does not exist', async () => {
      const state = 'missing-or-expired-state';
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue(null);

      const result = await controller.verify(mockRequest, {
        code: 'code',
        state,
      });

      expect(result).toHaveProperty('errors');
    });

    it('should return internal error on unexpected failure', async () => {
      const state = 'opaque-oauth-state';
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        brandId,
        id: 'credential-id',
        organizationId: orgId,
        userId,
      });
      mockLinkedInService.exchangeAuthCodeForAccessToken.mockRejectedValue(
        new Error('Network error'),
      );

      const error = await expectHttpStatus(
        controller.verify(mockRequest, {
          code: 'code',
          state,
        }),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      expect(error.getResponse()).toEqual({
        detail: 'Failed to verify LinkedIn OAuth',
        title: 'Internal Server Error',
      });
    });

    it('should rethrow HttpException from service', async () => {
      const state = 'opaque-oauth-state';
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        brandId,
        id: 'credential-id',
        organizationId: orgId,
        userId,
      });
      mockLinkedInService.exchangeAuthCodeForAccessToken.mockRejectedValue(
        new HttpException('Forbidden', 403),
      );

      await expect(
        controller.verify(mockRequest, { code: 'code', state }),
      ).rejects.toThrow(HttpException);
    });

    it('maps an expired authorization code to 400', async () => {
      const state = 'opaque-oauth-state';
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        brandId,
        id: 'credential-id',
        organizationId: orgId,
        userId,
      });
      mockLinkedInService.exchangeAuthCodeForAccessToken.mockRejectedValue({
        response: {
          data: {
            error: 'invalid_grant',
            error_description: 'Authorization code expired',
          },
          status: 400,
        },
      });

      await expectHttpStatus(
        controller.verify(mockRequest, { code: 'expired-code', state }),
        HttpStatus.BAD_REQUEST,
      );
    });

    it('maps a LinkedIn 401 on profile fetch to 401', async () => {
      const state = 'opaque-oauth-state';
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        brandId,
        id: 'credential-id',
        organizationId: orgId,
        userId,
      });
      mockLinkedInService.exchangeAuthCodeForAccessToken.mockResolvedValue({
        accessToken: 'linkedin-token',
        expiresIn: 5184000,
      });
      mockLinkedInService.getUserProfile.mockRejectedValue({
        metadata: { status: 401 },
        name: 'IntegrationHttpError',
      });

      await expectHttpStatus(
        controller.verify(mockRequest, { code: 'auth-code', state }),
        HttpStatus.UNAUTHORIZED,
      );
    });

    it('maps a LinkedIn 5xx token exchange to 502', async () => {
      const state = 'opaque-oauth-state';
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        brandId,
        id: 'credential-id',
        organizationId: orgId,
        userId,
      });
      mockLinkedInService.exchangeAuthCodeForAccessToken.mockRejectedValue({
        response: { status: 503 },
      });

      await expectHttpStatus(
        controller.verify(mockRequest, { code: 'auth-code', state }),
        HttpStatus.BAD_GATEWAY,
      );
    });

    it('does not log authorization codes or provider payloads', async () => {
      const state = 'opaque-oauth-state';
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        brandId,
        id: 'credential-id',
        organizationId: orgId,
        userId,
      });
      mockLinkedInService.exchangeAuthCodeForAccessToken.mockRejectedValue({
        response: {
          data: {
            error: 'invalid_grant',
            error_description: 'Authorization code expired',
          },
          status: 400,
        },
      });

      await expectHttpStatus(
        controller.verify(mockRequest, {
          code: 'super-secret-authorization-code',
          state,
        }),
        HttpStatus.BAD_REQUEST,
      );

      const logged = JSON.stringify([
        mockLoggerService.log.mock.calls,
        mockLoggerService.error.mock.calls,
      ]);

      expect(logged).not.toContain('super-secret-authorization-code');
      expect(logged).not.toContain('Authorization code expired');
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          hasCode: true,
          hasState: true,
        }),
      );
    });
  });

  describe('refreshAuthorizedSignals', () => {
    it('returns the documented 404 when the credential is missing or cross-org', async () => {
      mockLinkedInAuthorizedSignalsService.refresh.mockRejectedValueOnce(
        new NotFoundException('LinkedIn credential'),
      );

      await expect(
        controller.refreshAuthorizedSignals(
          mockRequest,
          mockUser as unknown as import('@api/auth/interfaces/authenticated-user.interface').AuthenticatedUser,
          'missing-credential',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockCredentialsService.findOne).not.toHaveBeenCalled();
    });

    it('refreshes and returns only the caller organization credential', async () => {
      mockCredentialsService.findOne.mockResolvedValueOnce({
        id: 'credential-1',
        organizationId: orgId,
        platform: 'linkedin',
      });

      const result = await controller.refreshAuthorizedSignals(
        mockRequest,
        mockUser as unknown as import('@api/auth/interfaces/authenticated-user.interface').AuthenticatedUser,
        'credential-1',
      );

      expect(mockLinkedInAuthorizedSignalsService.refresh).toHaveBeenCalledWith(
        {
          credentialId: 'credential-1',
          organizationId: orgId,
        },
      );
      expect(mockCredentialsService.findOne).toHaveBeenCalledWith({
        id: 'credential-1',
        organizationId: orgId,
        platform: 'linkedin',
      });
      expect(result).toEqual({
        data: {
          id: 'credential-1',
          organizationId: orgId,
          platform: 'linkedin',
        },
      });
    });
  });
});
