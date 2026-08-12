import { describe, expect, it, vi } from 'vitest';
import { BotsRestreamChatService } from './bots-restream-chat.service';

describe('BotsRestreamChatService.resolveRestreamAccessToken', () => {
  const livestream = {
    ingestTranscriptChunk: vi.fn(),
  };
  const logger = { warn: vi.fn(), log: vi.fn(), error: vi.fn() };

  it('returns fresh access token without calling refresh', async () => {
    const credentialsService = {
      findOne: vi.fn().mockResolvedValue({
        accessToken: 'fresh-access',
        accessTokenExpiry: new Date(Date.now() + 3_600_000),
        id: 'cred-fresh',
        refreshToken: 'refresh-1',
      }),
      patch: vi.fn(),
    };
    const restreamService = {
      refreshAccessToken: vi.fn(),
      collectChatActions: vi.fn(),
    };

    const service = new BotsRestreamChatService(
      livestream as never,
      logger as never,
      restreamService as never,
      credentialsService as never,
    );

    const token = await service.resolveRestreamAccessToken({
      brandId: 'brand-1',
      id: 'bot-1',
      livestreamSettings: { restreamCredentialId: 'cred-fresh' },
      organizationId: 'org-1',
    } as never);

    expect(token).toBe('fresh-access');
    expect(restreamService.refreshAccessToken).not.toHaveBeenCalled();
    expect(credentialsService.patch).not.toHaveBeenCalled();
  });

  it('refreshes when access token is expired and persists the new token', async () => {
    const credentialsService = {
      findOne: vi.fn().mockResolvedValue({
        accessToken: 'stale-access',
        accessTokenExpiry: new Date(Date.now() - 60_000),
        id: 'cred-stale',
        refreshToken: 'refresh-stale',
      }),
      patch: vi.fn().mockResolvedValue({}),
    };
    const restreamService = {
      refreshAccessToken: vi.fn().mockResolvedValue({
        access_token: 'rotated-access',
        expires_in: 3600,
        refresh_token: 'refresh-stale',
      }),
      collectChatActions: vi.fn(),
    };

    const service = new BotsRestreamChatService(
      livestream as never,
      logger as never,
      restreamService as never,
      credentialsService as never,
    );

    const token = await service.resolveRestreamAccessToken({
      brandId: 'brand-1',
      id: 'bot-1',
      livestreamSettings: { restreamCredentialId: 'cred-stale' },
      organizationId: 'org-1',
    } as never);

    expect(token).toBe('rotated-access');
    expect(restreamService.refreshAccessToken).toHaveBeenCalledWith(
      'refresh-stale',
    );
    expect(credentialsService.patch).toHaveBeenCalledWith(
      'cred-stale',
      expect.objectContaining({
        accessToken: 'rotated-access',
      }),
    );
  });

  it('forceRefresh refreshes even when expiry is still in the future', async () => {
    const credentialsService = {
      findOne: vi.fn().mockResolvedValue({
        accessToken: 'maybe-revoked',
        accessTokenExpiry: new Date(Date.now() + 3_600_000),
        id: 'cred-force',
        refreshToken: 'refresh-force',
      }),
      patch: vi.fn().mockResolvedValue({}),
    };
    const restreamService = {
      refreshAccessToken: vi.fn().mockResolvedValue({
        access_token: 'after-force',
        expires_in: 3600,
      }),
      collectChatActions: vi.fn(),
    };

    const service = new BotsRestreamChatService(
      livestream as never,
      logger as never,
      restreamService as never,
      credentialsService as never,
    );

    const token = await service.resolveRestreamAccessToken(
      {
        brandId: 'brand-1',
        id: 'bot-1',
        livestreamSettings: { restreamCredentialId: 'cred-force' },
        organizationId: 'org-1',
      } as never,
      { forceRefresh: true },
    );

    expect(token).toBe('after-force');
    expect(restreamService.refreshAccessToken).toHaveBeenCalledWith(
      'refresh-force',
    );
  });
});
