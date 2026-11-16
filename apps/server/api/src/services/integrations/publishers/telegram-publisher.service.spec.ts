vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => value },
}));

import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { TelegramPublisherService } from '@api/services/integrations/publishers/telegram-publisher.service';
import {
  TelegramApiError,
  type TelegramBotApiService,
  type TelegramSendInput,
} from '@api/services/integrations/telegram/services/telegram-bot-api.service';
import { DistributionContentType, PostCategory } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

type Sent = { botToken: string; input: TelegramSendInput };

function buildPublisher(failure?: TelegramApiError) {
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
    settings?: Record<string, unknown>;
  } = {},
): PublishContext {
  return {
    brandId: 'brand-1',
    credential: { accessToken: 'bot-token', id: 'credential-1' },
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
    settings: overrides.settings ?? { chatId: '@genfeed' },
  } as unknown as PublishContext;
}

describe('TelegramPublisherService', () => {
  it('publishes text to the chat and returns the message id and public link', async () => {
    const { publisher, sent } = buildPublisher();

    const result = await publisher.publish(buildContext());

    expect(result).toMatchObject({
      executionState: 'published',
      externalId: '501',
      success: true,
      url: 'https://t.me/genfeed/501',
    });
    expect(sent).toEqual([
      {
        botToken: 'bot-token',
        input: {
          chatId: '@genfeed',
          contentType: DistributionContentType.TEXT,
          text: 'Launch &amp; learn',
        },
      },
    ]);
  });

  it('links a numeric channel id with the t.me/c form', async () => {
    const { publisher } = buildPublisher();

    const result = await publisher.publish(
      buildContext({ settings: { chatId: '-1001234567890' } }),
    );

    expect(result.url).toBe('https://t.me/c/1234567890/501');
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

  it('fails without a chat to post to', async () => {
    const { publisher, sent } = buildPublisher();

    const result = await publisher.publish(buildContext({ settings: {} }));

    expect(result).toMatchObject({
      errorCode: 'chat_required',
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
      code: 'channel_disconnected',
      isRetryable: false,
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
      code: 'rate_limited',
      retryAfterMs: 7000,
    });
    expect(credentialPatches).toEqual([]);
  });
});
