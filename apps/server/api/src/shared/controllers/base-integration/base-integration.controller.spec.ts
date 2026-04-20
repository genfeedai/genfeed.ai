import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import {
  BaseIntegrationController,
  type OAuthUrlResult,
} from '@api/shared/controllers/base-integration/base-integration.controller';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: '507f1f77bcf86cd799439012',
    user: '507f1f77bcf86cd799439011',
  }),
}));

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('handleConnect'),
  },
}));

/**
 * Concrete subclass for testing the abstract BaseIntegrationController
 */
class TestIntegrationController extends BaseIntegrationController {
  protected readonly platform = CredentialPlatform.YOUTUBE;

  private mockOAuthResult: OAuthUrlResult = {
    url: 'https://oauth.example.com/authorize',
  };

  constructor(
    brandsService: BrandsService,
    credentialsService: CredentialsService,
    loggerService: LoggerService,
  ) {
    super(
      brandsService,
      credentialsService,
      loggerService,
      'TestIntegrationController',
    );
  }

  protected async generateOAuthUrl(
    _brandId: string,
    _publicMetadata: IClerkPublicMetadata,
  ): Promise<OAuthUrlResult> {
    return this.mockOAuthResult;
  }

  setMockOAuthResult(result: OAuthUrlResult): void {
    this.mockOAuthResult = result;
  }

  // Expose protected methods for testing
  async testHandleConnect(
    user: User,
    dto: { brand?: string },
  ): Promise<OAuthUrlResult> {
    return this.handleConnect(user, dto as never);
  }

  async testValidateBrand(brandId: string, organizationId: string) {
    return this.validateBrand(brandId, organizationId);
  }

  async testGetOrCreateCredential(
    brand: { _id: string; organization: string },
    initialData?: Record<string, unknown>,
  ) {
    return this.getOrCreateCredential(brand, initialData);
  }

  testUpdateCredentialWithTokens(
    credentialId: string,
    verifyResult: {
      accessToken: string;
      accessSecret?: string;
      refreshToken?: string;
      expiryDate?: number;
      externalId?: string;
      externalHandle?: string;
    },
  ) {
    return this.updateCredentialWithTokens(credentialId, verifyResult);
  }

  testGetLogUrl(methodName?: string): string {
    return this.getLogUrl(methodName);
  }
}

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

describe('BaseIntegrationController', () => {
  const orgId = '507f1f77bcf86cd799439012';
  const userId = '507f1f77bcf86cd799439011';
  const brandId = '507f191e810c19729de860ee';

  let controller: TestIntegrationController;
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let credentialsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    saveCredentials: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    publicMetadata: { organization: orgId, user: userId },
  } as unknown as User;

  beforeEach(() => {
    brandsService = {
      findOne: vi.fn().mockResolvedValue({
        _id: brandId,
        organization: orgId,
      }),
    };

    credentialsService = {
      findOne: vi.fn().mockResolvedValue({
        _id: '507f191e810c19729de860ee',
        isConnected: false,
      }),
      patch: vi.fn().mockResolvedValue({ _id: 'cred-1', isConnected: true }),
      saveCredentials: vi.fn().mockResolvedValue({ _id: 'cred-1' }),
    };

    controller = new TestIntegrationController(
      brandsService as unknown as BrandsService,
      credentialsService as unknown as CredentialsService,
      createMockLogger(),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getLogUrl', () => {
    it('should return formatted log URL with method name', () => {
      const result = controller.testGetLogUrl('connect');

      expect(result).toBe('TestIntegrationController connect');
    });

    it('should use CallerUtil when no method name is provided', () => {
      const result = controller.testGetLogUrl();

      expect(result).toBe('TestIntegrationController handleConnect');
    });
  });

  describe('validateBrand', () => {
    it('should return brand when it exists and belongs to organization', async () => {
      const result = await controller.testValidateBrand(
        brandId.toString(),
        orgId,
      );

      expect(brandsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(String),
          isDeleted: false,
          organization: expect.any(String),
        }),
      );
      expect(result).toHaveProperty('_id');
    });

    it('should throw FORBIDDEN when brand is not found', async () => {
      brandsService.findOne.mockResolvedValue(null);
      const fakeBrandId = '507f191e810c19729de860ee'.toString();

      await expect(
        controller.testValidateBrand(fakeBrandId, orgId),
      ).rejects.toThrow(HttpException);

      try {
        await controller.testValidateBrand(fakeBrandId, orgId);
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });
  });

  describe('getOrCreateCredential', () => {
    it('should return existing credential if found', async () => {
      const brand = {
        _id: brandId,
        organization: orgId,
      };

      const result = await controller.testGetOrCreateCredential(brand);

      expect(credentialsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: expect.any(String),
          organization: expect.any(String),
          platform: CredentialPlatform.YOUTUBE,
        }),
      );
      expect(credentialsService.saveCredentials).not.toHaveBeenCalled();
      expect(result).toHaveProperty('_id');
    });

    it('should create and return new credential if none exists', async () => {
      const brand = {
        _id: brandId,
        organization: orgId,
      };

      credentialsService.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          _id: '507f191e810c19729de860ee',
          isConnected: false,
        });

      const result = await controller.testGetOrCreateCredential(brand);

      expect(credentialsService.saveCredentials).toHaveBeenCalledWith(
        brand,
        CredentialPlatform.YOUTUBE,
        expect.objectContaining({ isConnected: false }),
      );
      expect(result).toHaveProperty('_id');
    });
  });

  describe('handleConnect', () => {
    it('should validate brand, generate OAuth URL, and create credential', async () => {
      const result = await controller.testHandleConnect(mockUser, {
        brand: brandId.toString(),
      });

      expect(brandsService.findOne).toHaveBeenCalled();
      expect(result).toEqual({
        url: 'https://oauth.example.com/authorize',
      });
    });

    it('should save credential with OAuth tokens when provided', async () => {
      controller.setMockOAuthResult({
        oauthToken: 'request-token',
        oauthTokenSecret: 'request-secret',
        url: 'https://oauth.example.com/authorize',
      });

      await controller.testHandleConnect(mockUser, {
        brand: brandId.toString(),
      });

      expect(credentialsService.saveCredentials).toHaveBeenCalledWith(
        expect.anything(),
        CredentialPlatform.YOUTUBE,
        expect.objectContaining({
          isConnected: false,
          oauthToken: 'request-token',
          oauthTokenSecret: 'request-secret',
        }),
      );
    });

    it('should throw BAD_REQUEST when brand ID is missing', async () => {
      await expect(controller.testHandleConnect(mockUser, {})).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw FORBIDDEN when brand does not belong to organization', async () => {
      brandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.testHandleConnect(mockUser, {
          brand: '507f191e810c19729de860ee'.toString(),
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('updateCredentialWithTokens', () => {
    it('should patch credential with tokens and clear temporary fields', () => {
      const credId = '507f191e810c19729de860ee';
      const verifyResult = {
        accessSecret: 'access-secret',
        accessToken: 'final-access-token',
        expiryDate: Date.now() + 3600000,
        externalHandle: '@testuser',
        externalId: 'ext-123',
        refreshToken: 'refresh-token',
      };

      controller.testUpdateCredentialWithTokens(credId, verifyResult);

      expect(credentialsService.patch).toHaveBeenCalledWith(
        credId,
        expect.objectContaining({
          accessToken: 'final-access-token',
          accessTokenSecret: 'access-secret',
          externalHandle: '@testuser',
          externalId: 'ext-123',
          isConnected: true,
          isDeleted: false,
          oauthToken: undefined,
          oauthTokenSecret: undefined,
          refreshToken: 'refresh-token',
          refreshTokenExpiry: expect.any(Date),
        }),
      );
    });

    it('should handle missing optional fields', () => {
      const credId = '507f191e810c19729de860ee';
      const verifyResult = {
        accessToken: 'token-only',
      };

      controller.testUpdateCredentialWithTokens(credId, verifyResult);

      expect(credentialsService.patch).toHaveBeenCalledWith(
        credId,
        expect.objectContaining({
          accessToken: 'token-only',
          accessTokenSecret: undefined,
          isConnected: true,
          refreshToken: undefined,
          refreshTokenExpiry: undefined,
        }),
      );
    });
  });
});
