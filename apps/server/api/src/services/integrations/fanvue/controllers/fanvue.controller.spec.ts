import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { FanvueController } from '@api/services/integrations/fanvue/controllers/fanvue.controller';
import { FanvueService } from '@api/services/integrations/fanvue/services/fanvue.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: '507f1f77bcf86cd799439012',
    user: '507f1f77bcf86cd799439011',
  }),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn().mockImplementation((detail) => ({
    errors: [{ ...detail, status: '400' }],
  })),
  returnInternalServerError: vi.fn().mockImplementation((msg) => ({
    errors: [{ detail: msg, status: '500' }],
  })),
  returnNotFound: vi.fn().mockImplementation((_name, _credentialId) => ({
    errors: [{ status: '404' }],
  })),
  serializeSingle: vi
    .fn()
    .mockImplementation((_req, _serializer, data) => ({ data })),
}));

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
    findPendingOAuthCredential: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let fanvueService: {
    buildAuthUrl: ReturnType<typeof vi.fn>;
    exchangeCodeForTokens: ReturnType<typeof vi.fn>;
    generatePkce: ReturnType<typeof vi.fn>;
    getUserProfile: ReturnType<typeof vi.fn>;
  };

  const orgId = '507f1f77bcf86cd799439012';
  const brandId = 'test-object-id';

  const mockUser = {
    publicMetadata: { organization: orgId, user: '507f1f77bcf86cd799439011' },
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
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'FANVUE_CLIENT_ID') return 'test-client-id';
              if (key === 'FANVUE_REDIRECT_URI')
                return 'https://app.genfeed.ai/fanvue/callback';
              return null;
            }),
          },
        },
        {
          provide: BrandsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({
              id: brandId,
              organizationId: orgId,
              userId: '507f1f77bcf86cd799439011',
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
      expect(fanvueService.generatePkce).toHaveBeenCalled();
      expect(credentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
        expect.anything(),
        '507f1f77bcf86cd799439011',
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

    it('should return bad request when brand is not found', async () => {
      brandsService.findOne.mockResolvedValue(null);

      const result = await controller.connect(mockReq, mockUser, {
        brandId,
      } as never);

      expect(result).toEqual({
        errors: [expect.objectContaining({ status: '400' })],
      });
      expect(fanvueService.generatePkce).not.toHaveBeenCalled();
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
        userId: '507f1f77bcf86cd799439011',
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
      expect(credentialsService.patch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          accessToken: 'fanvue-access-token',
          externalHandle: 'testcreator',
          externalId: 'fanvue-uuid-1',
          externalName: 'Test Creator',
          isConnected: true,
          isDeleted: false,
          oauthState: null,
          oauthToken: null,
          oauthTokenSecret: null,
          refreshToken: 'fanvue-refresh-token',
        }),
      );
      expect(result).toEqual({
        data: { id: 'cred-1', isConnected: true },
      });
    });

    it('should return bad request when code or state is missing', async () => {
      const result = await controller.verify(mockReq, {
        code: undefined,
        state: undefined,
      } as never);

      expect(result).toEqual({
        errors: [expect.objectContaining({ status: '400' })],
      });
    });

    it('should return not found when credential does not exist', async () => {
      credentialsService.findPendingOAuthCredential.mockResolvedValue(null);

      const result = await controller.verify(mockReq, {
        code: 'auth-code',
        state: 'missing-state',
      } as never);

      expect(result).toEqual({ errors: [{ status: '404' }] });
    });

    it('should return bad request when oauthToken (code_verifier) is missing', async () => {
      credentialsService.findPendingOAuthCredential.mockResolvedValue({
        id: 'test-object-id',
        oauthToken: null,
      });

      const result = await controller.verify(mockReq, {
        code: 'auth-code',
        state: 'opaque-oauth-state',
      } as never);

      expect(result).toEqual({
        errors: [expect.objectContaining({ status: '400' })],
      });
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

      const result = await controller.verify(mockReq, {
        code: 'expired-code',
        state: 'opaque-oauth-state',
      } as never);

      expect(result).toEqual({
        errors: [expect.objectContaining({ status: '400' })],
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

      const result = await controller.verify(mockReq, {
        code: 'auth-code',
        state: 'opaque-oauth-state',
      } as never);

      expect(result).toEqual({
        errors: [expect.objectContaining({ status: '500' })],
      });
    });
  });
});
