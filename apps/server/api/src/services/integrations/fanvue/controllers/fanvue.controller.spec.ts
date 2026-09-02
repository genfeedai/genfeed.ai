import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { FanvueController } from '@api/services/integrations/fanvue/controllers/fanvue.controller';
import { FanvueService } from '@api/services/integrations/fanvue/services/fanvue.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();

  return {
    ...actual,
    serializeSingle: vi
      .fn()
      .mockImplementation((_req, _serializer, data) => ({ data })),
  };
});

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn().mockReturnValue('decrypted-code-verifier'),
  },
}));

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('connect'),
  },
}));

describe('FanvueController', () => {
  let controller: FanvueController;
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let credentialsService: {
    beginOAuthForBrand: ReturnType<typeof vi.fn>;
    connectAccount: ReturnType<typeof vi.fn>;
    findPendingOAuthCredential: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let fanvueService: {
    buildAuthUrl: ReturnType<typeof vi.fn>;
    exchangeCodeForTokens: ReturnType<typeof vi.fn>;
    generatePkce: ReturnType<typeof vi.fn>;
    getUserProfile: ReturnType<typeof vi.fn>;
    requireConfigured: ReturnType<typeof vi.fn>;
  };

  const orgId = testId('org');
  const userId = testId('user');
  const brandId = 'test-object-id';

  const mockUser = {
    organizationId: orgId,
    userId,
  } as unknown as User;

  const mockReq = {
    headers: {},
    url: '/services/fanvue',
  } as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FanvueController],
      providers: [
        {
          provide: BrandsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({
              id: brandId,
              organizationId: orgId,
              userId: userId,
            }),
          },
        },
        {
          provide: CredentialsService,
          useValue: {
            beginOAuthForBrand: vi.fn().mockResolvedValue({
              credential: { id: 'cred-1' },
              state: 'opaque-oauth-state',
            }),
            connectAccount: vi
              .fn()
              .mockResolvedValue({ id: 'cred-1', isConnected: true }),
            findPendingOAuthCredential: vi.fn(),
            patch: vi
              .fn()
              .mockResolvedValue({ id: 'cred-1', isConnected: true }),
          },
        },
        {
          provide: FanvueService,
          useValue: {
            buildAuthUrl: vi
              .fn()
              .mockReturnValue('https://fanvue.com/oauth?code_challenge=abc'),
            exchangeCodeForTokens: vi.fn().mockResolvedValue({
              access_token: 'fanvue-access-token',
              expires_in: 3600,
              refresh_token: 'fanvue-refresh-token',
              scope:
                'openid offline_access read:self read:media write:media write:post',
            }),
            generatePkce: vi.fn().mockReturnValue({
              codeChallenge: 'test-challenge',
              codeVerifier: 'test-verifier',
            }),
            getUserProfile: vi.fn().mockResolvedValue({
              displayName: 'Test Creator',
              handle: 'testcreator',
              uuid: 'fanvue-uuid-1',
            }),
            requireConfigured: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(FanvueController);
    brandsService = module.get(BrandsService);
    credentialsService = module.get(CredentialsService);
    fanvueService = module.get(FanvueService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    it('should generate PKCE pair and return OAuth URL', async () => {
      const dto = { brandId };
      const result = await controller.connect(mockReq, mockUser, dto as never);

      expect(brandsService.findOne).toHaveBeenCalledWith({
        id: brandId,
        organizationId: orgId,
      });
      expect(fanvueService.requireConfigured).toHaveBeenCalledOnce();
      expect(fanvueService.generatePkce).toHaveBeenCalled();
      expect(credentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
        expect.anything(),
        userId,
        CredentialPlatform.FANVUE,
        expect.objectContaining({
          isConnected: false,
          oauthToken: 'test-verifier',
        }),
      );
      expect(fanvueService.buildAuthUrl).toHaveBeenCalledWith(
        'opaque-oauth-state',
        'test-challenge',
      );
      expect(result).toEqual({
        data: { url: 'https://fanvue.com/oauth?code_challenge=abc' },
      });
    });

    it('should preserve bad request when brand is not found', async () => {
      brandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.connect(mockReq, mockUser, { brandId } as never),
      ).rejects.toMatchObject({ status: 400 });
      expect(fanvueService.generatePkce).not.toHaveBeenCalled();
    });

    it('fails closed before generating or persisting PKCE state', async () => {
      fanvueService.requireConfigured.mockImplementation(() => {
        throw new ServiceUnavailableException(
          'Fanvue OAuth is not configured for this deployment.',
        );
      });

      await expect(
        controller.connect(mockReq, mockUser, { brandId } as never),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(fanvueService.generatePkce).not.toHaveBeenCalled();
      expect(credentialsService.beginOAuthForBrand).not.toHaveBeenCalled();
      expect(fanvueService.buildAuthUrl).not.toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it('should exchange code for tokens and update credential', async () => {
      const state = 'opaque-oauth-state';

      credentialsService.findPendingOAuthCredential.mockResolvedValue({
        brandId,
        id: 'test-object-id',
        oauthToken: 'encrypted-verifier',
        organizationId: orgId,
        userId: userId,
      });

      const result = await controller.verify(mockReq, {
        code: 'auth-code-123',
        state,
      } as never);

      expect(
        credentialsService.findPendingOAuthCredential,
      ).toHaveBeenCalledWith('opaque-oauth-state', CredentialPlatform.FANVUE);
      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('encrypted-verifier');
      expect(fanvueService.exchangeCodeForTokens).toHaveBeenCalledWith(
        'auth-code-123',
        'decrypted-code-verifier',
      );
      expect(fanvueService.getUserProfile).toHaveBeenCalledWith(
        'fanvue-access-token',
      );
      expect(credentialsService.connectAccount).toHaveBeenCalledWith(
        'test-object-id',
        orgId,
        expect.objectContaining({
          handle: 'testcreator',
          id: 'fanvue-uuid-1',
          name: 'Test Creator',
        }),
        expect.objectContaining({
          accessToken: 'fanvue-access-token',
          grantedScopes: [
            'offline_access',
            'openid',
            'read:media',
            'read:self',
            'write:media',
            'write:post',
          ],
          grantedScopesCapturedAt: expect.any(Date),
          oauthToken: null,
          oauthTokenSecret: null,
          refreshToken: 'fanvue-refresh-token',
        }),
      );
      expect(result).toEqual({
        data: { id: 'cred-1', isConnected: true },
      });
    });

    it('should preserve bad request when code or state is missing', async () => {
      await expect(
        controller.verify(mockReq, {
          code: undefined,
          state: undefined,
        } as never),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('should preserve not found when credential does not exist', async () => {
      credentialsService.findPendingOAuthCredential.mockResolvedValue(null);

      await expect(
        controller.verify(mockReq, {
          code: 'auth-code',
          state: 'missing-state',
        } as never),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('should preserve bad request when oauthToken is missing', async () => {
      credentialsService.findPendingOAuthCredential.mockResolvedValue({
        id: 'test-object-id',
        oauthToken: null,
      });

      await expect(
        controller.verify(mockReq, {
          code: 'auth-code',
          state: 'opaque-oauth-state',
        } as never),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('should return bad request on invalid_grant error', async () => {
      credentialsService.findPendingOAuthCredential.mockResolvedValue({
        id: 'test-object-id',
        oauthToken: 'encrypted-verifier',
      });
      fanvueService.exchangeCodeForTokens.mockRejectedValue({
        response: {
          data: { error: 'invalid_grant', message: 'Code expired' },
        },
      });

      await expect(
        controller.verify(mockReq, {
          code: 'expired-code',
          state: 'opaque-oauth-state',
        } as never),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('preserves a sanitized configuration error from token exchange', async () => {
      credentialsService.findPendingOAuthCredential.mockResolvedValue({
        id: 'test-object-id',
        oauthToken: 'encrypted-verifier',
      });
      fanvueService.exchangeCodeForTokens.mockRejectedValue(
        new ServiceUnavailableException(
          'Fanvue OAuth is not configured for this deployment.',
        ),
      );

      await expect(
        controller.verify(mockReq, {
          code: 'auth-code',
          state: 'opaque-oauth-state',
        } as never),
      ).rejects.toMatchObject({
        message: 'Fanvue OAuth is not configured for this deployment.',
      });
    });

    it('should return internal server error on unknown error', async () => {
      credentialsService.findPendingOAuthCredential.mockResolvedValue({
        id: 'test-object-id',
        oauthToken: 'encrypted-verifier',
      });
      fanvueService.exchangeCodeForTokens.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        controller.verify(mockReq, {
          code: 'auth-code',
          state: 'opaque-oauth-state',
        } as never),
      ).rejects.toMatchObject({ status: 500 });
    });
  });
});
