import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { CacheService } from '@api/services/cache/cache.service';
import { TelegramGroupLinkService } from '@api/services/integrations/telegram/services/telegram-group-link.service';
import type { ConfigService } from '@libs/config/config.service';
import { describe, expect, it } from 'vitest';

const scope = { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' };

function build(config: Record<string, string> = {}) {
  const store = new Map<string, unknown>();
  const ttls: Array<number | undefined> = [];
  const profiles: Array<{
    handle?: string | null;
    id?: string | null;
    name?: string | null;
    organizationId: string;
  }> = [];
  const cacheService = {
    getdel: async (key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return value;
    },
    set: async (key: string, value: unknown, options?: { ttl?: number }) => {
      store.set(key, value);
      ttls.push(options?.ttl);
      return true;
    },
  };
  const brandsService = {
    findOne: async (where: { id: string; organizationId: string }) =>
      where.id === 'brand-1' && where.organizationId === 'org-1'
        ? { id: 'brand-1', label: 'Acme', organizationId: 'org-1' }
        : null,
  };
  const credentialsService = {
    createPendingForBrand: async () => ({ id: 'credential-1' }),
    updateExternalProfile: async (
      _id: string,
      organizationId: string,
      profile: { handle?: string | null; id?: string | null },
    ) => {
      profiles.push({ ...profile, organizationId });
      return { id: 'credential-1', isConnected: true };
    },
  };
  const configService = {
    get: (key: string) =>
      ({
        TELEGRAM_BOT_TOKEN: '123:abc',
        TELEGRAM_BOT_USERNAME: 'genfeed_bot',
        ...config,
      })[key],
  };
  const service = new TelegramGroupLinkService(
    cacheService as unknown as CacheService,
    brandsService as unknown as BrandsService,
    credentialsService as unknown as CredentialsService,
    configService as unknown as ConfigService,
  );
  return { profiles, service, ttls };
}

describe('TelegramGroupLinkService', () => {
  it('builds an add-bot link whose code connects the group that sends it, once', async () => {
    const { profiles, service, ttls } = build();

    const { code, url } = await service.createLink(scope);

    expect(url).toBe(
      `https://t.me/genfeed_bot?startgroup=${code}&admin=manage_chat`,
    );
    expect(ttls).toEqual([900]);
    expect(
      await service.linkChat(code, { id: -100123, title: 'Acme Team' }),
    ).toEqual({ brandLabel: 'Acme' });
    expect(profiles).toEqual([
      {
        handle: null,
        id: '-100123',
        name: 'Acme Team',
        organizationId: 'org-1',
      },
    ]);
    expect(await service.linkChat(code, { id: -100123 })).toBeNull();
  });

  it('answers nothing for a code it never issued', async () => {
    const { profiles, service } = build();

    expect(
      await service.linkChat('A'.repeat(32), { id: -100123, title: 'Acme' }),
    ).toBeNull();
    expect(await service.linkChat('short', { id: 1 })).toBeNull();
    expect(profiles).toEqual([]);
  });

  it('refuses to issue a link where no bot is configured', async () => {
    const { service } = build({ TELEGRAM_BOT_USERNAME: '' });

    await expect(service.createLink(scope)).rejects.toThrow(
      'Telegram is not set up on this deployment',
    );
  });
});
