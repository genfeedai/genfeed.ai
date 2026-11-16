vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => value },
}));

import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import {
  DiscordApiError,
  type DiscordWebhookMessage,
  type DiscordWebhookService,
} from '@api/services/integrations/discord/services/discord-webhook.service';
import { DiscordPublisherService } from '@api/services/integrations/publishers/discord-publisher.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { PostCategory, PublishErrorKind } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

function buildPublisher(failure?: DiscordApiError) {
  const posted: Array<{ message: DiscordWebhookMessage; webhookPath: string }> =
    [];
  const credentialPatches: Array<{ id: string; isConnected?: boolean }> = [];
  const discordWebhook = {
    execute: async (webhookPath: string, message: DiscordWebhookMessage) => {
      if (failure) throw failure;
      posted.push({ message, webhookPath });
      return { channelId: '222', messageId: '999' };
    },
  };
  const credentialsService = {
    patch: async (id: string, patch: { isConnected?: boolean }) => {
      credentialPatches.push({ id, ...patch });
    },
  };
  const http = {
    get: () =>
      of({
        data: new Uint8Array([1, 2, 3]).buffer,
        headers: { 'content-type': 'image/png' },
      }),
  };
  const silent = () => undefined;
  const publisher = new DiscordPublisherService(
    {
      ingredientsEndpoint: 'https://cdn.example.test',
      isAuthorizedMediaDeliveryEnabled: false,
    } as unknown as ConfigService,
    { error: silent, log: silent, warn: silent } as unknown as LoggerService,
    discordWebhook as unknown as DiscordWebhookService,
    credentialsService as unknown as CredentialsService,
    http as unknown as HttpService,
  );
  return { credentialPatches, posted, publisher };
}

function buildContext(
  overrides: {
    accessToken?: string;
    category?: PostCategory;
    description?: string;
    ingredients?: string[];
  } = {},
): PublishContext {
  return {
    brandId: 'brand-1',
    credential: {
      accessToken: overrides.accessToken ?? '111/token-abc',
      externalId: '777:222',
      id: 'credential-1',
    },
    organization: { id: 'org-1' },
    organizationId: 'org-1',
    post: {
      category: overrides.category ?? PostCategory.TEXT,
      description: overrides.description ?? '<p>Hello Discord</p>',
      id: 'post-1',
      ingredients: overrides.ingredients ?? [],
      label: 'Post',
    },
    postId: 'post-1',
    settings: {},
  } as unknown as PublishContext;
}

describe('DiscordPublisherService', () => {
  it('posts text through the webhook and returns the message link', async () => {
    const { posted, publisher } = buildPublisher();

    const result = await publisher.publish(buildContext());

    expect(result).toMatchObject({
      externalId: '999',
      success: true,
      url: 'https://discord.com/channels/777/222/999',
    });
    expect(posted).toEqual([
      {
        message: { content: 'Hello Discord', files: [] },
        webhookPath: '111/token-abc',
      },
    ]);
  });

  it('attaches downloaded media as files', async () => {
    const { posted, publisher } = buildPublisher();

    await publisher.publish(
      buildContext({ category: PostCategory.IMAGE, ingredients: ['image-1'] }),
    );

    expect(posted[0].message.files).toEqual([
      {
        bytes: new Uint8Array([1, 2, 3]),
        contentType: 'image/png',
        filename: 'media-1.png',
      },
    ]);
  });

  it('rejects a message over 2000 characters before posting', async () => {
    const { posted, publisher } = buildPublisher();

    const result = await publisher.publish(
      buildContext({ description: 'x'.repeat(2001) }),
    );

    expect(result).toMatchObject({
      errorCode: 'caption_too_long',
      success: false,
    });
    expect(posted).toEqual([]);
  });

  it('asks to reconnect a sign-in-only Discord account', async () => {
    const { posted, publisher } = buildPublisher();

    const result = await publisher.publish(
      buildContext({ accessToken: 'oauth-user-access-token' }),
    );

    expect(result).toMatchObject({
      errorCode: 'channel_not_connected',
      success: false,
    });
    expect(posted).toEqual([]);
  });

  it('marks the credential disconnected when the webhook is gone', async () => {
    const { credentialPatches, publisher } = buildPublisher(
      new DiscordApiError('Discord refused the message', 'webhook_gone', 404),
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
      new DiscordApiError(
        'Discord rate limit on the channel webhook',
        'rate_limited',
        429,
        1500,
      ),
    );

    await expect(publisher.publish(buildContext())).rejects.toMatchObject({
      kind: PublishErrorKind.RATE_LIMITED,
      retryAfterMs: 1500,
    });
    expect(credentialPatches).toEqual([]);
  });

  it.each([
    ['unavailable', 503, PublishErrorKind.OUTCOME_UNKNOWN],
    ['rejected', 400, PublishErrorKind.CONTENT_REJECTED],
  ] as const)('reads a %s answer as %s', async (kind, status, expected) => {
    const { publisher } = buildPublisher(
      new DiscordApiError('Discord answered', kind, status),
    );

    await expect(publisher.publish(buildContext())).rejects.toMatchObject({
      httpStatus: status,
      kind: expected,
    });
  });
});
