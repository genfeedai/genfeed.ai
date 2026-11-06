import type { PostsService } from '@api/collections/posts/services/posts.service';
import { YoutubeUploadCompletionService } from '@api/services/integrations/youtube/services/modules/youtube-upload-completion.service';
import type { PublishEventWebhookService } from '@api/services/webhook-client/publish-event-webhook.service';
import {
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { RedisService } from '@libs/redis/redis.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Post = Record<string, unknown> & { id: string };

interface WebhookEvent {
  event: 'failed' | 'published';
  payload: Record<string, unknown>;
}

const CHANNEL = 'youtube:upload:complete';
const NOW = new Date('2026-11-06T12:00:00.000Z');
const UPLOADED_AT = '2026-11-06T11:59:00.000Z';

const completion = (fields: Record<string, unknown>) => ({
  organizationId: 'org-1',
  postId: 'post-1',
  result: {
    externalId: 'yt-vid-1',
    videoUrl: 'https://youtube.com/watch?v=yt-vid-1',
  },
  timestamp: UPLOADED_AT,
  userId: 'user-1',
  ...fields,
});

// The handler runs detached from the Redis callback; let it finish.
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('YoutubeUploadCompletionService', () => {
  let isDatabaseDown: boolean;
  let channels: Map<string, (data: unknown) => void>;
  let outbox: WebhookEvent[];
  let posts: Map<string, Post>;

  const publish = async (data: unknown) => {
    channels.get(CHANNEL)?.(data);
    await settle();
  };

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    isDatabaseDown = false;
    channels = new Map();
    outbox = [];
    posts = new Map([['post-1', { id: 'post-1', organizationId: 'org-1' }]]);

    const redis = {
      subscribe: async (channel: string, handler: (data: unknown) => void) => {
        channels.set(channel, handler);
      },
    } as unknown as RedisService;
    const postsService = {
      patch: async (id: string, data: Record<string, unknown>) => {
        if (isDatabaseDown) {
          throw new Error('DB connection lost');
        }
        const post = posts.get(id);
        return post ? { ...Object.assign(post, data) } : null;
      },
    } as unknown as PostsService;
    const webhooks = {
      emitPostFailed: async (payload: Record<string, unknown>) => {
        outbox.push({ event: 'failed', payload });
      },
      emitPostPublished: async (payload: Record<string, unknown>) => {
        outbox.push({ event: 'published', payload });
      },
    } as unknown as PublishEventWebhookService;

    await new YoutubeUploadCompletionService(
      redis,
      postsService,
      webhooks,
    ).onModuleInit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['public', PostVisibility.PUBLIC],
    ['private', PostVisibility.PRIVATE],
    ['unlisted', PostVisibility.UNLISTED],
  ])('publishes a post uploaded as %s', async (status, visibility) => {
    await publish(completion({ status }));

    const published = {
      externalId: 'yt-vid-1',
      id: 'post-1',
      organizationId: 'org-1',
      publicationDate: NOW,
      targetExecutionState: TargetExecutionState.PUBLISHED,
      visibility,
    };
    expect(posts.get('post-1')).toEqual(published);
    expect(outbox).toEqual([
      {
        event: 'published',
        payload: {
          externalProviderId: 'yt-vid-1',
          occurredAt: new Date(UPLOADED_AT),
          platform: 'youtube',
          post: published,
          publishedAt: NOW,
          url: 'https://youtube.com/watch?v=yt-vid-1',
        },
      },
    ]);
  });

  it('marks a scheduled upload scheduled without a publication date or webhook', async () => {
    await publish(completion({ status: 'scheduled' }));

    expect(posts.get('post-1')).toEqual({
      externalId: 'yt-vid-1',
      id: 'post-1',
      organizationId: 'org-1',
      targetExecutionState: TargetExecutionState.SCHEDULED,
    });
    expect(outbox).toEqual([]);
  });

  it.each([
    ['its error', 'Upload quota exceeded', 'Upload quota exceeded'],
    ['a default message', undefined, 'YouTube upload failed'],
  ])('fails a failed upload with %s', async (_case, error, errorMessage) => {
    await publish(completion({ error, result: null, status: 'failed' }));

    expect(posts.get('post-1')).toEqual({
      error,
      id: 'post-1',
      organizationId: 'org-1',
      targetExecutionState: TargetExecutionState.FAILED,
    });
    expect(outbox).toEqual([
      {
        event: 'failed',
        payload: expect.objectContaining({
          errorMessage,
          platform: 'youtube',
          retryable: false,
        }),
      },
    ]);
  });

  it('describes a post the database no longer returns from the event', async () => {
    await publish(completion({ postId: 'post-gone', status: 'public' }));

    expect(outbox).toEqual([
      {
        event: 'published',
        payload: expect.objectContaining({
          post: {
            externalId: 'yt-vid-1',
            id: 'post-gone',
            organization: 'org-1',
            organizationId: 'org-1',
            platform: 'youtube',
            publicationDate: new Date(UPLOADED_AT),
            status: PostStatus.PUBLIC,
            targetExecutionState: TargetExecutionState.PUBLISHED,
            url: 'https://youtube.com/watch?v=yt-vid-1',
            user: 'user-1',
            visibility: PostVisibility.PUBLIC,
          },
        }),
      },
    ]);
  });

  it.each([
    ['no post id', completion({ postId: undefined, status: 'public' })],
    ['an unknown status', completion({ status: 'processing' })],
    [
      'a result without a video URL',
      completion({ result: { externalId: 'yt-vid-1' }, status: 'public' }),
    ],
    ['a non-string error', completion({ error: 42, status: 'failed' })],
    ['no object at all', 'public'],
  ])('ignores an event with %s', async (_case, data) => {
    await publish(data);

    expect(posts.get('post-1')).toEqual({
      id: 'post-1',
      organizationId: 'org-1',
    });
    expect(outbox).toEqual([]);
  });

  it('emits nothing when the post cannot be saved', async () => {
    isDatabaseDown = true;

    await publish(completion({ status: 'public' }));

    expect(outbox).toEqual([]);
  });
});
