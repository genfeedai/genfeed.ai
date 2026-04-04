import { ByokService } from '@api/services/byok/byok.service';
import { OpenAiOAuthController } from '@api/services/integrations/openai-llm/controllers/openai-oauth.controller';
import { OpenAiOAuthService } from '@api/services/integrations/openai-llm/services/openai-oauth.service';
import type { User } from '@clerk/backend';
import { ByokProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: '507f1f77bcf86cd799439012',
    user: '507f1f77bcf86cd799439011',
  }),
}));

describe('OpenAiOAuthController', () => {
  let controller: OpenAiOAuthController;
  let openAiOAuthService: {
    buildByokEntry: ReturnType<typeof vi.fn>;
    exchangeCodeForTokens: ReturnType<typeof vi.fn>;
    generateAuthUrl: ReturnType<typeof vi.fn>;
  };
  let byokService: {
    saveOAuthKey: ReturnType<typeof vi.fn>;
  };

  const orgId = '507f1f77bcf86cd799439012';
  const userId = '507f1f77bcf86cd799439011';

  const mockUser = {
    publicMetadata: { organization: orgId, user: userId },
  } as unknown as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpenAiOAuthController],
      providers: [
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: OpenAiOAuthService,
          useValue: {
            buildByokEntry: vi.fn().mockReturnValue({
              accessToken: 'encrypted-token',
              authMode: 'oauth',
            }),
            exchangeCodeForTokens: vi.fn().mockResolvedValue({
              accountId: 'acct-123',
              organizationId: orgId,
              tokens: {
                access_token: 'openai-access-token',
                refresh_token: 'openai-refresh-token',
              },
            }),
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://platform.openai.com/oauth/authorize?...',
              ),
          },
        },
        {
          provide: ByokService,
          useValue: {
            saveOAuthKey: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get(OpenAiOAuthController);
    openAiOAuthService = module.get(OpenAiOAuthService);
    byokService = module.get(ByokService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    it('should generate an auth URL with org and user context', async () => {
      const result = await controller.connect(mockUser);

      expect(openAiOAuthService.generateAuthUrl).toHaveBeenCalledWith(
        orgId,
        userId,
      );
      expect(result).toEqual({
        data: { url: 'https://platform.openai.com/oauth/authorize?...' },
      });
    });

    it('should propagate errors from generateAuthUrl', async () => {
      openAiOAuthService.generateAuthUrl.mockImplementation(() => {
        throw new Error('Config missing');
      });

      await expect(controller.connect(mockUser)).rejects.toThrow(
        'Config missing',
      );
    });
  });

  describe('verify', () => {
    it('should exchange code, build BYOK entry, and save OAuth key', async () => {
      const body = { code: 'auth-code-123', state: 'some-state' };
      const result = await controller.verify(mockUser, body);

      expect(openAiOAuthService.exchangeCodeForTokens).toHaveBeenCalledWith(
        'auth-code-123',
        'some-state',
      );
      expect(openAiOAuthService.buildByokEntry).toHaveBeenCalledWith(
        {
          access_token: 'openai-access-token',
          refresh_token: 'openai-refresh-token',
        },
        'acct-123',
      );
      expect(byokService.saveOAuthKey).toHaveBeenCalledWith(
        orgId,
        ByokProvider.OPENAI,
        { accessToken: 'encrypted-token', authMode: 'oauth' },
      );
      expect(result).toEqual({
        data: {
          accountId: 'acct-123',
          authMode: 'oauth',
          isConnected: true,
          provider: 'openai',
        },
      });
    });

    it('should throw BAD_REQUEST when code is missing', async () => {
      const body = { code: '', state: 'some-state' };

      await expect(controller.verify(mockUser, body)).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw BAD_REQUEST when state is missing', async () => {
      const body = { code: 'auth-code', state: '' };

      await expect(controller.verify(mockUser, body)).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw FORBIDDEN when organization does not match', async () => {
      openAiOAuthService.exchangeCodeForTokens.mockResolvedValue({
        accountId: 'acct-123',
        organizationId: 'different-org-id',
        tokens: { access_token: 'token' },
      });

      const body = { code: 'auth-code', state: 'state' };

      await expect(controller.verify(mockUser, body)).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
        }),
      );
    });

    it('should propagate errors from exchangeCodeForTokens', async () => {
      openAiOAuthService.exchangeCodeForTokens.mockRejectedValue(
        new Error('Token exchange failed'),
      );

      const body = { code: 'bad-code', state: 'state' };

      await expect(controller.verify(mockUser, body)).rejects.toThrow(
        'Token exchange failed',
      );
    });
  });
});
