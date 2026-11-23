import {
  type PostForPlatformDeletion,
  PostPlatformDeletionService,
} from '@api/collections/posts/services/post-platform-deletion.service';
import type { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import type { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => `plain:${value}` },
}));

/** What each provider still holds, so a spec reads state, not calls. */
function build(
  options: {
    credential?: { accessToken: string; description: string } | null;
    xAnswers?: { deleted: boolean } | Error;
    mastodonFails?: boolean;
  } = {},
) {
  const live = {
    mastodon: new Set(['status-1']),
    x: new Set(['tweet-1']),
  };
  const asked: string[] = [];
  const twitter = {
    deleteTweet: async (
      _organizationId: string,
      _brandId: string,
      tweetId: string,
    ) => {
      const answer = options.xAnswers ?? { deleted: true };
      if (answer instanceof Error) throw answer;
      if (answer.deleted) live.x.delete(tweetId);
      return { deleted: answer.deleted, tweetId };
    },
  };
  const mastodon = {
    deleteStatus: async (
      instanceUrl: string,
      accessToken: string,
      statusId: string,
    ) => {
      asked.push(`${instanceUrl}|${accessToken}|${statusId}`);
      if (options.mastodonFails) throw new Error('401');
      live.mastodon.delete(statusId);
    },
  };
  const prisma = {
    credential: {
      findFirst: async () =>
        options.credential === undefined
          ? { accessToken: 'secret', description: 'https://mastodon.example' }
          : options.credential,
    },
  };
  const service = new PostPlatformDeletionService(
    prisma as unknown as PrismaService,
    twitter as unknown as TwitterService,
    mastodon as unknown as MastodonService,
    { error: () => undefined } as unknown as LoggerService,
  );
  return { asked, live, service };
}

function post(
  overrides: Partial<PostForPlatformDeletion> = {},
): PostForPlatformDeletion {
  return {
    brandId: 'brand-1',
    credentialId: 'cred-1',
    externalId: 'tweet-1',
    id: 'p1',
    platform: 'twitter',
    status: 'public',
    ...overrides,
  };
}

describe('PostPlatformDeletionService', () => {
  it('deletes a published X post and confirms it is gone', async () => {
    const { live, service } = build();

    await expect(service.deleteOnPlatform('org-1', post())).resolves.toBe(
      'deleted',
    );
    expect([...live.x]).toEqual([]);
  });

  it('does not call X-deleted when X says the post was not deleted', async () => {
    const { live, service } = build({ xAnswers: { deleted: false } });

    await expect(
      service.deleteOnPlatform('org-1', post()),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect([...live.x]).toEqual(['tweet-1']);
  });

  it('turns a provider failure into one refusal that names the platform', async () => {
    const { service } = build({ xAnswers: new Error('token expired') });

    await expect(service.deleteOnPlatform('org-1', post())).rejects.toThrow(
      /X did not delete the post, so nothing was deleted/,
    );
  });

  it('deletes a Mastodon status with the account credential and instance', async () => {
    const { asked, live, service } = build();

    await expect(
      service.deleteOnPlatform(
        'org-1',
        post({ externalId: 'status-1', platform: 'mastodon' }),
      ),
    ).resolves.toBe('deleted');
    expect(asked).toEqual(['https://mastodon.example|plain:secret|status-1']);
    expect([...live.mastodon]).toEqual([]);
  });

  it('refuses a Mastodon delete without a credential or instance', async () => {
    const { service } = build({ credential: null });

    await expect(
      service.deleteOnPlatform(
        'org-1',
        post({ externalId: 'status-1', platform: 'mastodon' }),
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('refuses a platform it cannot delete on, before touching anything', async () => {
    const { asked, live, service } = build();

    await expect(
      service.deleteOnPlatform(
        'org-1',
        post({ externalId: 'ig-1', platform: 'instagram' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(asked).toEqual([]);
    expect([...live.x]).toEqual(['tweet-1']);
  });

  it('has nothing to delete for a post that never reached a network', async () => {
    const { service } = build();

    await expect(
      service.deleteOnPlatform(
        'org-1',
        post({ externalId: null, status: 'draft' }),
      ),
    ).resolves.toBe('not-published');
  });
});
