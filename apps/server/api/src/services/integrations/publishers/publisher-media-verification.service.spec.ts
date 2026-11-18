import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { FacebookPublisherService } from '@api/services/integrations/publishers/facebook-publisher.service';
import { InstagramPublisherService } from '@api/services/integrations/publishers/instagram-publisher.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import {
  CredentialPlatform,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startedAt = new Date('2026-10-03T10:00:00Z');
const afterGrace = new Date('2026-10-03T12:00:00Z');

const credential = {
  accessToken: 'encrypted-fixture',
  externalBusinessId: 'business',
  externalId: 'account',
  id: testId('credential'),
  isConnected: true,
  isDeleted: false,
  organizationId: testId('org'),
};

function contextFor(
  overrides: Partial<PublishContext> & { postCategory?: PostCategory } = {},
  ingredients: unknown[] = ['image-1'],
): PublishContext {
  const { postCategory = PostCategory.IMAGE, ...rest } = overrides;
  return {
    brandId: testId('brand'),
    credential,
    hasThreadChildren: false,
    organizationId: testId('org'),
    post: {
      category: postCategory,
      description: '<p>Exact caption</p>',
      id: testId('post'),
      ingredients,
      label: 'title',
    },
    postId: testId('post'),
    settings: {},
    ...rest,
  } as unknown as PublishContext;
}

const credentials = {
  findOne: vi.fn(),
  patch: vi.fn(),
  resolveBrandAccount: vi.fn(),
};
const http = { get: vi.fn(), post: vi.fn() };

async function createModule() {
  return Test.createTestingModule({
    providers: [
      InstagramPublisherService,
      FacebookPublisherService,
      InstagramService,
      FacebookService,
      { provide: CredentialsService, useValue: credentials },
      { provide: SERVER_TOKENS.credentials, useValue: credentials },
      { provide: PostsService, useValue: {} },
      { provide: HttpService, useValue: http },
      {
        provide: ConfigService,
        useValue: {
          get: vi.fn().mockReturnValue(''),
          ingredientsEndpoint: 'https://cdn.example',
        },
      },
      {
        provide: LoggerService,
        useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
      },
    ],
  }).compile();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Instagram publisher verification', () => {
  const media = {
    caption: 'Exact caption',
    id: '1790',
    media_product_type: 'FEED',
    media_type: 'IMAGE',
    permalink: 'https://www.instagram.com/p/ABC/',
    shortcode: 'ABC',
    timestamp: '2026-10-03T10:00:03+0000',
  };
  let publisher: InstagramPublisherService;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useFakeTimers({ now: afterGrace });
    vi.spyOn(EncryptionUtil, 'decrypt').mockReturnValue('fixture-access');
    credentials.resolveBrandAccount.mockResolvedValue(credential);
    publisher = (await createModule()).get(InstagramPublisherService);
  });

  it('settles an uncertain image publish as published with its shortcode URL', async () => {
    http.get.mockReturnValue(of({ data: { data: [media] } }));
    expect(
      await publisher.verifyPublished(contextFor(), startedAt),
    ).toMatchObject({
      executionState: TargetExecutionState.PUBLISHED,
      externalId: '1790',
      externalShortcode: 'ABC',
      platform: CredentialPlatform.INSTAGRAM,
      success: true,
      url: 'https://www.instagram.com/p/ABC',
    });
    const [url, config] = http.get.mock.calls[0];
    expect(url).toMatch(/\/account\/media$/);
    expect(config).toMatchObject({
      params: {
        access_token: 'fixture-access',
        since: Math.floor(startedAt.getTime() / 1000),
      },
      timeout: 10000,
    });
  });

  it('settles a published reel and a carousel by their own media shape', async () => {
    http.get.mockReturnValue(
      of({
        data: {
          data: [
            {
              ...media,
              id: 'reel',
              media_product_type: 'REELS',
              media_type: 'VIDEO',
            },
            {
              ...media,
              caption: 'Carousel caption',
              children: { data: [{ id: 'a' }, { id: 'b' }] },
              id: 'carousel',
              media_type: 'CAROUSEL_ALBUM',
            },
          ],
        },
      }),
    );
    const reel = contextFor({ postCategory: PostCategory.VIDEO }, ['video-1']);
    expect((await publisher.verifyPublished(reel, startedAt))?.externalId).toBe(
      'reel',
    );
    const carousel = contextFor({}, ['image-1', 'image-2']);
    carousel.post.description = 'Carousel caption';
    expect(
      (await publisher.verifyPublished(carousel, startedAt))?.externalId,
    ).toBe('carousel');
  });

  it('settles with children pending: comments are delivered after the parent', async () => {
    http.get.mockReturnValue(of({ data: { data: [media] } }));
    const result = await publisher.verifyPublished(
      contextFor({ hasThreadChildren: true }),
      startedAt,
    );
    expect(result?.externalId).toBe('1790');
  });

  it('releases the post for a retry when the account has no such media', async () => {
    http.get.mockReturnValue(of({ data: { data: [] } }));
    expect(await publisher.verifyPublished(contextFor(), startedAt)).toBeNull();
  });

  it('keeps the outcome unknown while the media may still be processing', async () => {
    vi.setSystemTime(new Date('2026-10-03T10:10:00Z'));
    http.get.mockReturnValue(of({ data: { data: [] } }));
    const reel = contextFor({ postCategory: PostCategory.VIDEO }, ['video-1']);
    await expect(publisher.verifyPublished(reel, startedAt)).rejects.toThrow(
      'visibility grace',
    );
  });

  it('keeps the outcome unknown when the lookup fails', async () => {
    http.get.mockReturnValue(throwError(() => new Error('provider 503')));
    await expect(
      publisher.verifyPublished(contextFor(), startedAt),
    ).rejects.toThrow('provider 503');
  });

  it('never reads a changed or sibling account', async () => {
    credentials.resolveBrandAccount.mockResolvedValue({
      ...credential,
      externalId: 'sibling',
    });
    await expect(
      publisher.verifyPublished(contextFor(), startedAt),
    ).rejects.toThrow('account unavailable or changed');
    expect(http.get).not.toHaveBeenCalled();
  });
});

describe('Facebook publisher verification', () => {
  const post = {
    attachments: { data: [{ media_type: 'photo', target: { id: 'photo-1' } }] },
    created_time: '2026-10-03T10:00:03+0000',
    id: 'account_456',
    is_published: true,
    message: 'Exact caption',
    permalink_url: 'https://www.facebook.com/account/posts/456',
  };
  let publisher: FacebookPublisherService;

  function serve(feed: unknown) {
    http.get.mockImplementation((url: string) =>
      of({
        data: url.endsWith('/feed')
          ? feed
          : {
              data: [
                { access_token: 'page-token', id: 'account', name: 'Page' },
              ],
            },
      }),
    );
  }

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useFakeTimers({ now: afterGrace });
    vi.spyOn(EncryptionUtil, 'decrypt').mockReturnValue('fixture-access');
    credentials.resolveBrandAccount.mockResolvedValue(credential);
    publisher = (await createModule()).get(FacebookPublisherService);
  });

  it('settles an uncertain photo publish with the post id the publish returns', async () => {
    serve({ data: [post] });
    expect(
      await publisher.verifyPublished(contextFor(), startedAt),
    ).toMatchObject({
      executionState: TargetExecutionState.PUBLISHED,
      externalId: 'account_456',
      platform: CredentialPlatform.FACEBOOK,
      success: true,
      url: 'https://www.facebook.com/account_456',
    });
    const feedCall = http.get.mock.calls.find(([url]) =>
      String(url).endsWith('/feed'),
    );
    expect(feedCall?.[1]).toMatchObject({
      params: { access_token: 'page-token' },
      timeout: 10000,
    });
  });

  it('settles an uncertain video publish with the video id the publish returns', async () => {
    serve({
      data: [
        {
          ...post,
          attachments: {
            data: [{ media_type: 'video', target: { id: 'video-9' } }],
          },
        },
      ],
    });
    const video = contextFor({ postCategory: PostCategory.VIDEO }, ['video-1']);
    expect(
      (await publisher.verifyPublished(video, startedAt))?.externalId,
    ).toBe('video-9');
  });

  it('reads the page chosen in the channel settings', async () => {
    http.get.mockImplementation((url: string) =>
      of({
        data: url.endsWith('/feed')
          ? { data: [post] }
          : { data: [{ access_token: 'other-token', id: 'other-page' }] },
      }),
    );
    await publisher.verifyPublished(
      contextFor({ settings: { pageId: 'other-page' } }),
      startedAt,
    );
    const feedCall = http.get.mock.calls.find(([url]) =>
      String(url).endsWith('/feed'),
    );
    expect(String(feedCall?.[0])).toContain('/other-page/feed');
  });

  it('releases the post for a retry when the feed has no such post', async () => {
    serve({ data: [{ ...post, is_published: false }] });
    expect(await publisher.verifyPublished(contextFor(), startedAt)).toBeNull();
  });

  it('keeps the outcome unknown when the lookup fails or the page is gone', async () => {
    http.get.mockReturnValue(throwError(() => new Error('provider 503')));
    await expect(
      publisher.verifyPublished(contextFor(), startedAt),
    ).rejects.toThrow('provider 503');
    http.get.mockReturnValue(of({ data: { data: [] } }));
    await expect(
      publisher.verifyPublished(contextFor(), startedAt),
    ).rejects.toThrow('page unavailable or changed');
  });
});
