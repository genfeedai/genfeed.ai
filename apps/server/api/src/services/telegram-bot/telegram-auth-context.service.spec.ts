import type { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { TelegramAuthContextService } from '@api/services/telegram-bot/telegram-auth-context.service';
import type { Context } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

function createContext(text: string): {
  ctx: Context;
  deleteMessage: ReturnType<typeof vi.fn>;
  reply: ReturnType<typeof vi.fn>;
} {
  const deleteMessage = vi.fn().mockResolvedValue(undefined);
  const reply = vi.fn().mockResolvedValue(undefined);
  return {
    ctx: {
      chat: { id: 42, type: 'private' },
      deleteMessage,
      message: { text },
      reply,
    } as unknown as Context,
    deleteMessage,
    reply,
  };
}

describe('TelegramAuthContextService', () => {
  it('attaches a verified API-key context to the chat', async () => {
    const apiKeysService = {
      findByKey: vi.fn().mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-1',
        scopes: ['content:read'],
        userId: 'user-1',
      }),
    } as unknown as ApiKeysService;
    const service = new TelegramAuthContextService(apiKeysService);
    const { ctx, deleteMessage, reply } = createContext('/connect gf_secret');

    await service.handleConnect(ctx);

    expect(apiKeysService.findByKey).toHaveBeenCalledWith('gf_secret');
    expect(deleteMessage).toHaveBeenCalledTimes(1);
    expect(service.resolveAuthContext(42)).toEqual({
      apiKeyId: 'key-1',
      authType: 'api_key',
      organizationId: 'org-1',
      scopes: ['content:read'],
      userId: 'user-1',
    });
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('Connected'));
  });

  it('does not attach a context when the API key is invalid', async () => {
    const apiKeysService = {
      findByKey: vi.fn().mockResolvedValue(null),
    } as unknown as ApiKeysService;
    const service = new TelegramAuthContextService(apiKeysService);
    const { ctx, reply } = createContext('/connect gf_invalid');

    await service.handleConnect(ctx);

    expect(service.resolveAuthContext(42)).toBeNull();
    expect(reply).toHaveBeenCalledWith('❌ Invalid or expired API key.');
  });

  it('drops a connected chat when the key is later revoked', async () => {
    const apiKeysService = {
      findActiveById: vi.fn().mockResolvedValue(null),
      findByKey: vi.fn().mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-1',
        scopes: ['content:read'],
        userId: 'user-1',
      }),
    } as unknown as ApiKeysService;
    const service = new TelegramAuthContextService(apiKeysService);
    const { ctx } = createContext('/connect gf_secret');

    await service.handleConnect(ctx);
    expect(service.resolveAuthContext(42)?.apiKeyId).toBe('key-1');

    await expect(service.resolveLiveAuthContext(42)).resolves.toBeNull();
    expect(apiKeysService.findActiveById).toHaveBeenCalledWith('key-1');
    expect(service.resolveAuthContext(42)).toBeNull();
  });

  it('refreshes cached scopes from the live key row', async () => {
    const apiKeysService = {
      findActiveById: vi.fn().mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-1',
        scopes: ['videos:read'],
        userId: 'user-1',
      }),
      findByKey: vi.fn().mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-1',
        scopes: ['content:read'],
        userId: 'user-1',
      }),
    } as unknown as ApiKeysService;
    const service = new TelegramAuthContextService(apiKeysService);
    const { ctx } = createContext('/connect gf_secret');

    await service.handleConnect(ctx);

    await expect(service.resolveLiveAuthContext(42)).resolves.toEqual({
      apiKeyId: 'key-1',
      authType: 'api_key',
      organizationId: 'org-1',
      scopes: ['videos:read'],
      userId: 'user-1',
    });
  });
});
