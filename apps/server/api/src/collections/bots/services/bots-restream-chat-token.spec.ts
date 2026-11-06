import type { BotDocument } from '@api/collections/bots/schemas/bot.schema';
import type { BotsService } from '@api/collections/bots/services/bots.service';
import type { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { BotsRestreamChatService } from '@api/collections/bots/services/bots-restream-chat.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { RestreamService } from '@api/services/integrations/restream/services/restream.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface CredentialRow {
  accessToken: string;
  accessTokenExpiry: Date;
  brandId: string;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  platform: string;
  refreshToken?: string;
}

interface RefreshResult {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

const HOUR = 3_600_000;

describe('BotsRestreamChatService.resolveRestreamAccessToken', () => {
  let credentials: CredentialRow[];
  let botPatches: Array<{ id: string; update: Record<string, unknown> }>;
  let refreshedWith: string[];
  let refreshResult: RefreshResult;

  function credential(
    id: string,
    overrides: Partial<CredentialRow> = {},
  ): CredentialRow {
    return {
      accessToken: `${id}-access`,
      accessTokenExpiry: new Date(Date.now() + HOUR),
      brandId: 'brand-1',
      id,
      isDeleted: false,
      organizationId: 'org-1',
      platform: 'restream',
      refreshToken: `${id}-refresh`,
      ...overrides,
    };
  }

  function bot(livestreamSettings: Record<string, unknown>): BotDocument {
    return {
      brandId: 'brand-1',
      id: 'bot-1',
      livestreamSettings,
      organizationId: 'org-1',
    } as unknown as BotDocument;
  }

  function makeService(options: { hasBotsService: boolean }) {
    const credentialsService = {
      findOne: async (where: {
        id: string;
        isDeleted: boolean;
        organizationId: string;
      }) =>
        credentials.find(
          (row) =>
            row.id === where.id &&
            row.isDeleted === where.isDeleted &&
            row.organizationId === where.organizationId,
        ) ?? null,
      patch: async (id: string, update: Partial<CredentialRow>) => {
        const row = credentials.find((candidate) => candidate.id === id);
        if (row) {
          Object.assign(row, update);
        }
        return row;
      },
      resolveBrandAccount: async (where: {
        brandId: string;
        organizationId: string;
        platform: string;
      }) =>
        credentials.find(
          (row) =>
            !row.isDeleted &&
            row.brandId === where.brandId &&
            row.organizationId === where.organizationId &&
            row.platform === where.platform,
        ) ?? null,
    };
    const restreamService = {
      collectChatActions: async () => [],
      refreshAccessToken: async (refreshToken: string) => {
        refreshedWith.push(refreshToken);
        return refreshResult;
      },
    };
    const botsService = {
      patch: async (id: string, update: Record<string, unknown>) => {
        botPatches.push({ id, update });
        return {};
      },
    };
    const logger = { error: () => {}, log: () => {}, warn: () => {} };

    return new BotsRestreamChatService(
      { ingestTranscriptChunk: async () => undefined } as unknown as BotsLivestreamService,
      logger as unknown as LoggerService,
      restreamService as unknown as RestreamService,
      credentialsService as unknown as CredentialsService,
      options.hasBotsService
        ? (botsService as unknown as BotsService)
        : undefined,
    );
  }

  beforeEach(() => {
    credentials = [];
    botPatches = [];
    refreshedWith = [];
    refreshResult = {
      access_token: 'rotated-access',
      expires_in: 3600,
    };
  });

  it('returns a fresh access token without refreshing it', async () => {
    credentials = [credential('cred-fresh')];

    const token = await makeService({
      hasBotsService: false,
    }).resolveRestreamAccessToken(bot({ restreamCredentialId: 'cred-fresh' }));

    expect(token).toBe('cred-fresh-access');
    expect(refreshedWith).toEqual([]);
    expect(credentials[0]?.accessToken).toBe('cred-fresh-access');
  });

  it('refreshes an expired access token and stores the rotated one', async () => {
    credentials = [
      credential('cred-stale', {
        accessToken: 'stale-access',
        accessTokenExpiry: new Date(Date.now() - 60_000),
      }),
    ];
    refreshResult = {
      access_token: 'rotated-access',
      expires_in: 3600,
      refresh_token: 'rotated-refresh',
    };

    const token = await makeService({
      hasBotsService: false,
    }).resolveRestreamAccessToken(bot({ restreamCredentialId: 'cred-stale' }));

    expect(token).toBe('rotated-access');
    expect(refreshedWith).toEqual(['cred-stale-refresh']);
    expect(credentials[0]).toMatchObject({
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
    });
    expect(credentials[0]?.accessTokenExpiry.getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it('binds the brand Restream credential to a bot that has none', async () => {
    credentials = [credential('cred-brand')];

    const token = await makeService({
      hasBotsService: true,
    }).resolveRestreamAccessToken(bot({}));

    expect(token).toBe('cred-brand-access');
    expect(botPatches).toEqual([
      {
        id: 'bot-1',
        update: {
          livestreamSettings: {
            restreamCredentialId: 'cred-brand',
            transcriptSource: 'restream_chat',
          },
        },
      },
    ]);
  });

  it('ignores a pinned credential from another organization and falls back to the brand account', async () => {
    credentials = [
      credential('cred-foreign', { organizationId: 'org-2' }),
      credential('cred-brand'),
    ];

    const token = await makeService({
      hasBotsService: true,
    }).resolveRestreamAccessToken(
      bot({ restreamCredentialId: 'cred-foreign' }),
    );

    expect(token).toBe('cred-brand-access');
    expect(botPatches).toEqual([]);
  });

  it('returns null when the bot has no usable Restream credential', async () => {
    credentials = [credential('cred-deleted', { isDeleted: true })];

    await expect(
      makeService({ hasBotsService: true }).resolveRestreamAccessToken(
        bot({ restreamCredentialId: 'cred-deleted' }),
      ),
    ).resolves.toBeNull();
    expect(botPatches).toEqual([]);
  });

  it('forceRefresh refreshes even when expiry is still in the future', async () => {
    credentials = [credential('cred-force')];
    refreshResult = { access_token: 'after-force', expires_in: 3600 };

    const token = await makeService({
      hasBotsService: false,
    }).resolveRestreamAccessToken(bot({ restreamCredentialId: 'cred-force' }), {
      forceRefresh: true,
    });

    expect(token).toBe('after-force');
    expect(refreshedWith).toEqual(['cred-force-refresh']);
    expect(credentials[0]?.accessToken).toBe('after-force');
  });
});
