import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { TelegramPublisherService } from '@api/services/integrations/publishers/telegram-publisher.service';
import {
  TelegramApiError,
  type TelegramBotApiService,
  type TelegramSendInput,
} from '@api/services/integrations/telegram/services/telegram-bot-api.service';
import {
  DistributionContentType,
  PostCategory,
  PublishErrorKind,
} from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it } from 'vitest';

type Sent = { botToken: string; input: TelegramSendInput };

function buildPublisher(
  failure?: TelegramApiError,
  config: { TELEGRAM_BOT_TOKEN?: string } = { TELEGRAM_BOT_TOKEN: 'bot-token' },
) {
  const sent: Sent[] = [];
  const credentialPatches: Array<{ id: string; isConnected?: boolean }> = [];
  const telegramBotApi = {
    send: async (botToken: string, input: TelegramSendInput) => {
      if (failure) throw failure;
      sent.push({ botToken, input });
      return { messageId: '501' };
    },
  };
  const credentialsService = {
    patch: async (id: string, patch: { isConnected?: boolean }) => {
      credentialPatches.push({ id, ...patch });
    },
  };
  const silent = () => undefined;
  const publisher = new TelegramPublisherService(
    {
      get: (key: keyof typeof config) => config[key],
      ingredientsEndpoint: 'https://cdn.example.test',
      isAuthorizedMediaDeliveryEnabled: false,
    } as unknown as ConfigService,
    { error: silent, log: silent, warn: silent } as unknown as LoggerService,
    telegramBotApi as unknown as TelegramBotApiService,
    credentialsService as unknown as CredentialsService,
  );
  return { credentialPatches, publisher, sent };
}

function buildContext(
  overrides: {
    category?: PostCategory;
    description?: string;
    ingredients?: string[];
    externalId?: string | null;
  } = {},
): PublishContext {
  return {
    brandId: 'brand-1',
    credential: {
      externalId:
        overrides.externalId === undefined
          ? '-1001234567890'
          : overrides.externalId,
      id: 'credential-1',
    },
    organization: { id: 'org-1' },
    organizationId: 'org-1',
    post: {
      category: overrides.category ?? PostCategory.TEXT,
      description: overrides.description ?? '<p>Launch &amp; learn</p>',
      id: 'post-1',
      ingredients: overrides.ingredients ?? [],
      label: 'Post',
    },
    postId: 'post-1',
  } as unknown as PublishContext;
}

describe('TelegramPublisherService', () => {
  it('publishes text to the connected group with the platform bot and returns the message link', async () => {
    const { publisher, sent } = buildPublisher();

    const result = await publisher.publish(buildContext());

    expect(result).toMatchObject({
      executionState: 'published',
      externalId: '501',
      success: true,
      url: 'https://t.me/c/1234567890/501',
    });
    expect(sent).toEqual([
      {
        botToken: 'bot-token',
        input: {
          chatId: '-1001234567890',
          contentType: DistributionContentType.TEXT,
          text: 'Launch &amp; learn',
        },
      },
    ]);
  });

  it('sends a photo with the text as its caption', async () => {
    const { publisher, sent } = buildPublisher();

    await publisher.publish(
      buildContext({
        category: PostCategory.IMAGE,
        ingredients: ['image-1'],
      }),
    );

    expect(sent[0].input).toMatchObject({
      caption: 'Launch &amp; learn',
      contentType: DistributionContentType.PHOTO,
      mediaUrl: 'https://cdn.example.test/images/image-1',
    });
  });

  it('fails without a connected group', async () => {
    const { publisher, sent } = buildPublisher();

    const result = await publisher.publish(buildContext({ externalId: null }));

    expect(result).toMatchObject({
      errorCode: 'credential_missing',
      success: false,
    });
    expect(sent).toEqual([]);
  });

  it('fails where the deployment has no Telegram bot', async () => {
    const { publisher, sent } = buildPublisher(undefined, {});

    const result = await publisher.publish(buildContext());

    expect(result).toMatchObject({
      errorCode: 'platform_unavailable',
      success: false,
    });
    expect(sent).toEqual([]);
  });

  it('rejects a photo caption over 1024 characters before sending', async () => {
    const { publisher, sent } = buildPublisher();

    const result = await publisher.publish(
      buildContext({
        category: PostCategory.IMAGE,
        description: 'x'.repeat(1025),
        ingredients: ['image-1'],
      }),
    );

    expect(result).toMatchObject({
      errorCode: 'caption_too_long',
      success: false,
    });
    expect(sent).toEqual([]);
  });

  it('rejects a text post over 4096 characters before sending', async () => {
    const { publisher } = buildPublisher();

    const result = await publisher.publish(
      buildContext({ description: 'x'.repeat(4097) }),
    );

    expect(result).toMatchObject({
      errorCode: 'caption_too_long',
      success: false,
    });
  });

  it('marks the credential disconnected when the bot was removed', async () => {
    const { credentialPatches, publisher } = buildPublisher(
      new TelegramApiError('Telegram sendMessage failed', 'bot_removed', 403),
    );

    await expect(publisher.publish(buildContext())).rejects.toMatchObject({
      kind: PublishErrorKind.CHANNEL_DISCONNECTED,
    });
    expect(credentialPatches).toEqual([
      { id: 'credential-1', isConnected: false },
    ]);
  });

  it('passes the stated wait through on a rate limit and keeps the credential', async () => {
    const { credentialPatches, publisher } = buildPublisher(
      new TelegramApiError(
        'Telegram rate limit on sendMessage',
        'rate_limited',
        429,
        7000,
      ),
    );

    await expect(publisher.publish(buildContext())).rejects.toMatchObject({
      kind: PublishErrorKind.RATE_LIMITED,
      retryAfterMs: 7000,
    });
    expect(credentialPatches).toEqual([]);
  });
});
