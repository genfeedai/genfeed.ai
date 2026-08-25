import type {
  AuthenticatedUser,
  AuthenticatedUser as User,
} from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import {
  BaseIntegrationController,
  type OAuthUrlResult,
} from '@api/shared/controllers/base-integration/base-integration.controller';
import { CredentialPlatform } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    _user: AuthenticatedUser,
  ): Promise<OAuthUrlResult> {
    return this.mockOAuthResult;
  }

  setMockOAuthResult(result: OAuthUrlResult): void {
    this.mockOAuthResult = result;
  }

  // Expose protected methods for testing
  async testHandleConnect(
    user: User,
    dto: { brandId?: string },
  ): Promise<OAuthUrlResult> {
    return this.handleConnect(user, dto as never);
  }

  async testValidateBrand(brandId: string, organizationId: string) {
    return this.validateBrand(brandId, organizationId);
  }

  async testCreatePendingCredential(
    brand: {
      id: string;
      organizationId: string;
    },
    userId: string,
    initialData?: Record<string, unknown>,
  ) {
    return this.createPendingCredential(brand, userId, initialData);
  }

  testUpdateCredentialWithTokens(
    credentialId: string,
    organizationId: string,
    verifyResult: {
      accessToken: string;
      accessSecret?: string;
      refreshToken?: string;
      expiryDate?: number;
      externalId?: string;
      externalHandle?: string;
    },
  ) {
    return this.updateCredentialWithTokens(
      credentialId,
      organizationId,
      verifyResult,
    );
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
  const orgId = testId('org');
  const userId = testId('user');
  const brandId = testId('brand');

  let controller: TestIntegrationController;
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let credentialsService: {
    connectAccount: ReturnType<typeof vi.fn>;
    createPendingForBrand: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: userId,
    isSuperAdmin: false,
    organizationId: orgId,
    userId: userId,
  } as unknown as User;

  beforeEach(() => {
    brandsService = {
      findOne: vi.fn().mockResolvedValue({
        id: brandId,
        organizationId: orgId,
        userId,
      }),
    };

    credentialsService = {
      connectAccount: vi
        .fn()
        .mockResolvedValue({ id: 'cred-1', isConnected: true }),
      createPendingForBrand: vi.fn().mockResolvedValue({ id: 'cred-1' }),
      findOne: vi.fn().mockResolvedValue({
        id: testId('brand'),
        isConnected: false,
      }),
      patch: vi.fn().mockResolvedValue({ id: 'cred-1', isConnected: true }),
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

      expect(brandsService.findOne).toHaveBeenCalledWith({
        id: brandId,
        organizationId: orgId,
      });
      expect(result).toHaveProperty('id');
    });

    it('should throw FORBIDDEN when brand is not found', async () => {
      brandsService.findOne.mockResolvedValue(null);
      const fakeBrandId = testId('brand').toString();

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

  describe('createPendingCredential', () => {
    it('provisions a fresh pending credential without reading connected rows', async () => {
      const brand = {
        id: brandId,
        organizationId: orgId,
      };

      const result = await controller.testCreatePendingCredential(
        brand,
        userId,
      );

      // Connect cannot know which account the operator is about to authorize —
      // reading a live row here is what used to clobber a working account.
      expect(credentialsService.findOne).not.toHaveBeenCalled();
      expect(credentialsService.patch).not.toHaveBeenCalled();
      expect(credentialsService.createPendingForBrand).toHaveBeenCalledWith(
        brand,
        userId,
        CredentialPlatform.YOUTUBE,
        {},
      );
      expect(result).toHaveProperty('id');
    });

    it('carries request-token fields onto the pending row', async () => {
      const brand = {
        id: brandId,
        organizationId: orgId,
      };

      await controller.testCreatePendingCredential(brand, userId, {
        oauthToken: 'request-token',
      });

      expect(credentialsService.createPendingForBrand).toHaveBeenCalledWith(
        brand,
        userId,
        CredentialPlatform.YOUTUBE,
        { oauthToken: 'request-token' },
      );
    });
  });

  describe('handleConnect', () => {
    it('should validate brand, generate OAuth URL, and create credential', async () => {
      const result = await controller.testHandleConnect(mockUser, {
        brandId: brandId.toString(),
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
        brandId: brandId.toString(),
      });

      expect(credentialsService.createPendingForBrand).toHaveBeenCalledWith(
        expect.anything(),
        userId,
        CredentialPlatform.YOUTUBE,
        expect.objectContaining({
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
          brandId: testId('brand').toString(),
        }),
      ).rejects.toThrow(HttpException);
    });

    // An unset ConfigService key is cast to `string` by every integration and
    // reaches the authorize URL as the literal "undefined". The round-trip can
    // never complete, so the connect attempt must fail loudly instead of
    // leaving a credential row that reads "Not connected" forever.
    describe('when the platform is not configured on this server', () => {
      it.each([
        [
          'undefined',
          'https://oauth.example.com/authorize?client_id=undefined',
        ],
        ['null', 'https://oauth.example.com/authorize?client_id=null'],
        ['empty', 'https://oauth.example.com/authorize?client_id='],
      ])(
        'rejects a %s client_id with SERVICE_UNAVAILABLE',
        async (_label, url) => {
          controller.setMockOAuthResult({ url });

          await expect(
            controller.testHandleConnect(mockUser, { brandId }),
          ).rejects.toMatchObject({
            status: HttpStatus.SERVICE_UNAVAILABLE,
          });
        },
      );

      it('names the platform and the missing param in the error', async () => {
        controller.setMockOAuthResult({
          url: 'https://open-api.tiktok.com/auth?client_key=undefined',
        });

        try {
          await controller.testHandleConnect(mockUser, { brandId });
          expect.unreachable('connect should have thrown');
        } catch (error) {
          const response = (error as HttpException).getResponse() as {
            detail: string;
            title: string;
          };
          expect(response.title).toBe('Integration not configured');
          expect(response.detail).toContain(CredentialPlatform.YOUTUBE);
          expect(response.detail).toContain('client_key');
        }
      });

      it('writes no credential row', async () => {
        controller.setMockOAuthResult({
          url: 'https://oauth.example.com/authorize?client_id=undefined',
        });

        await expect(
          controller.testHandleConnect(mockUser, { brandId }),
        ).rejects.toThrow(HttpException);

        // The row is what made this invisible: connect persisted a permanently
        // unconnectable credential and returned 200.
        expect(credentialsService.createPendingForBrand).not.toHaveBeenCalled();
        expect(credentialsService.findOne).not.toHaveBeenCalled();
      });

      it('rejects an unparseable authorization URL', async () => {
        controller.setMockOAuthResult({ url: 'not-a-url' });

        await expect(
          controller.testHandleConnect(mockUser, { brandId }),
        ).rejects.toMatchObject({
          status: HttpStatus.SERVICE_UNAVAILABLE,
        });
      });
    });

    it('allows an OAuth 1.0a URL that carries no client id', async () => {
      // X's request-token flow has no client_id in the authorize URL; treating
      // its absence as "unconfigured" would break a working integration.
      controller.setMockOAuthResult({
        oauthToken: 'request-token',
        url: 'https://api.x.com/oauth/authenticate?oauth_token=request-token',
      });

      await expect(
        controller.testHandleConnect(mockUser, { brandId }),
      ).resolves.toMatchObject({ oauthToken: 'request-token' });
    });

    it('allows a configured client id through', async () => {
      controller.setMockOAuthResult({
        url: 'https://oauth.example.com/authorize?client_id=real-client-id',
      });

      await expect(
        controller.testHandleConnect(mockUser, { brandId }),
      ).resolves.toMatchObject({
        url: 'https://oauth.example.com/authorize?client_id=real-client-id',
      });
    });
  });

  describe('updateCredentialWithTokens', () => {
    it('settles the connection through account reconciliation', () => {
      const credId = testId('brand');
      const verifyResult = {
        accessSecret: 'access-secret',
        accessToken: 'final-access-token',
        expiryDate: Date.now() + 3600000,
        externalHandle: '@testuser',
        externalId: 'ext-123',
        refreshToken: 'refresh-token',
      };

      controller.testUpdateCredentialWithTokens(credId, orgId, verifyResult);

      // `externalId` reaches persistence only through `connectAccount`, which
      // decides between refreshing this brand's existing account and adding one.
      expect(credentialsService.patch).not.toHaveBeenCalled();
      expect(credentialsService.connectAccount).toHaveBeenCalledWith(
        credId,
        orgId,
        { handle: '@testuser', id: 'ext-123' },
        expect.objectContaining({
          accessToken: 'final-access-token',
          accessTokenSecret: 'access-secret',
          oauthToken: null,
          oauthTokenSecret: null,
          refreshToken: 'refresh-token',
          refreshTokenExpiry: expect.any(Date),
        }),
      );
    });

    it('should handle missing optional fields', () => {
      const credId = testId('brand');
      const verifyResult = {
        accessToken: 'token-only',
      };

      controller.testUpdateCredentialWithTokens(credId, orgId, verifyResult);

      expect(credentialsService.connectAccount).toHaveBeenCalledWith(
        credId,
        orgId,
        { handle: undefined, id: undefined },
        expect.objectContaining({
          accessToken: 'token-only',
          accessTokenSecret: undefined,
          refreshToken: undefined,
          refreshTokenExpiry: undefined,
        }),
      );
    });
  });
});
