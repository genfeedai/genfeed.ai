vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => value },
}));

import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { SlackPublisherService } from '@api/services/integrations/publishers/slack-publisher.service';
import {
  SlackApiError,
  type SlackService,
} from '@api/services/integrations/slack/services/slack.service';
import { PostCategory } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

type PostedMessage = { channelId: string; imageUrls: string[]; text: string };

function buildPublisher(failure?: SlackApiError) {
  const posted: PostedMessage[] = [];
  const credentialPatches: Array<{ id: string; isConnected?: boolean }> = [];
  const slackService = {
    getPermalink: async () =>
      'https://team.slack.com/archives/C1/p1700000000000100',
    postMessage: async (_token: string, message: PostedMessage) => {
      if (failure) throw failure;
      posted.push(message);
      return { channelId: message.channelId, ts: '1700000000.000100' };
    },
  };
  const credentialsService = {
    patch: async (id: string, patch: { isConnected?: boolean }) => {
      credentialPatches.push({ id, ...patch });
    },
  };
  const silent = () => undefined;
  const publisher = new SlackPublisherService(
    {
      ingredientsEndpoint: 'https://cdn.example.test',
      isAuthorizedMediaDeliveryEnabled: false,
    } as unknown as ConfigService,
    { error: silent, log: silent, warn: silent } as unknown as LoggerService,
    slackService as unknown as SlackService,
    credentialsService as unknown as CredentialsService,
  );
  return { credentialPatches, posted, publisher };
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
    credential: { accessToken: 'xoxb-token', id: 'credential-1' },
    organization: { id: 'org-1' },
    organizationId: 'org-1',
    post: {
      category: overrides.category ?? PostCategory.TEXT,
      description: overrides.description ?? '<p>Q&amp;A at 5 &lt;soon&gt;</p>',
      id: 'post-1',
      ingredients: overrides.ingredients ?? [],
      label: 'Post',
    },
    postId: 'post-1',
    settings: overrides.settings ?? { channelId: 'C1' },
  } as unknown as PublishContext;
}

describe('SlackPublisherService', () => {
  it('posts escaped text to the channel and returns the permalink', async () => {
    const { posted, publisher } = buildPublisher();

    const result = await publisher.publish(buildContext());

    expect(result).toMatchObject({
      externalId: '1700000000.000100',
      success: true,
      url: 'https://team.slack.com/archives/C1/p1700000000000100',
    });
    expect(posted).toEqual([
      { channelId: 'C1', imageUrls: [], text: 'Q&amp;A at 5 &lt;soon&gt;' },
    ]);
  });

  it('sends images with the message', async () => {
    const { posted, publisher } = buildPublisher();

    await publisher.publish(
      buildContext({ category: PostCategory.IMAGE, ingredients: ['image-1'] }),
    );

    expect(posted[0].imageUrls).toEqual([
      'https://cdn.example.test/images/image-1',
    ]);
  });

  it('refuses a video post, which this publisher cannot deliver', async () => {
    const { posted, publisher } = buildPublisher();

    const result = await publisher.publish(
      buildContext({ category: PostCategory.VIDEO, ingredients: ['video-1'] }),
    );

    expect(result.success).toBe(false);
    expect(posted).toEqual([]);
  });

  it('fails without a channel to post to', async () => {
    const { posted, publisher } = buildPublisher();

    const result = await publisher.publish(buildContext({ settings: {} }));

    expect(result).toMatchObject({
      errorCode: 'channel_required',
      success: false,
    });
    expect(posted).toEqual([]);
  });

  it('disconnects the workspace when its token was revoked', async () => {
    const { credentialPatches, publisher } = buildPublisher(
      new SlackApiError('Slack chat.postMessage failed', 'token_revoked', 200),
    );

    await expect(publisher.publish(buildContext())).rejects.toMatchObject({
      code: 'channel_disconnected',
      isRetryable: false,
    });
    expect(credentialPatches).toEqual([
      { id: 'credential-1', isConnected: false },
    ]);
  });

  it('fails only this post when the app is not in the channel', async () => {
    const { credentialPatches, publisher } = buildPublisher(
      new SlackApiError(
        'Slack chat.postMessage failed',
        'channel_unavailable',
        200,
      ),
    );

    await expect(publisher.publish(buildContext())).rejects.toMatchObject({
      code: 'channel_disconnected',
    });
    expect(credentialPatches).toEqual([]);
  });

  it('passes the stated wait through on a rate limit', async () => {
    const { publisher } = buildPublisher(
      new SlackApiError(
        'Slack rate limit on chat.postMessage',
        'rate_limited',
        429,
        30000,
      ),
    );

    await expect(publisher.publish(buildContext())).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterMs: 30000,
    });
  });
});
