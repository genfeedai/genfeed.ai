import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  type BlueskyPostRecord,
  BlueskyService,
} from '@api/services/integrations/bluesky/services/bluesky.service';
import { BlueskyCredentialRejectedError } from '@api/services/integrations/bluesky/utils/bluesky-api-error.util';
import { BlueskyPublisherService } from '@api/services/integrations/publishers/bluesky-publisher.service';
import type {
  PublishContext,
  PublisherPostInput,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import {
  CredentialPlatform,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DID = 'did:plc:abc123';

const credential = {
  accessToken: 'encrypted',
  description: 'https://bsky.social',
  externalHandle: 'alice.bsky.social',
  externalId: DID,
  id: 'credential-1',
  platform: CredentialPlatform.BLUESKY,
} as unknown as CredentialDocument;

function makeContext(post: Partial<PublisherPostInput> = {}): PublishContext {
  return {
    brandId: 'brand-1',
    credential,
    hasThreadChildren: false,
    organization: { id: 'org-1' } as PublishContext['organization'],
    organizationId: 'org-1',
    post: {
      category: PostCategory.TEXT,
      description: 'Hello Bluesky',
      id: 'post-1',
      ingredients: [],
      label: 'Hello',
      scheduledDate: new Date('2026-11-16T09:00:00Z'),
      ...post,
    } as PublisherPostInput,
    postId: 'post-1',
    settings: {},
  };
}

class FakeBlueskyService {
  readonly records: BlueskyPostRecord[] = [];
  readonly uploads: Array<{ mimeType: string; size: number }> = [];
  failWith?: Error;
  media = { buffer: Buffer.alloc(0), contentType: 'image/png' };
  maxImageDownloadBytes = 30 * 1024 * 1024;

  async buildFacets(_credential: CredentialDocument, text: string) {
    return text.includes('https://example.com')
      ? [
          {
            features: [
              {
                $type: 'app.bsky.richtext.facet#link' as const,
                uri: 'https://example.com',
              },
            ],
            index: {
              byteEnd:
                text.indexOf('https://example.com') +
                'https://example.com'.length,
              byteStart: text.indexOf('https://example.com'),
            },
          },
        ]
      : [];
  }

  async downloadMedia() {
    return this.media;
  }

  async uploadBlob(
    _credential: CredentialDocument,
    buffer: Buffer,
    mimeType: string,
  ) {
    this.uploads.push({ mimeType, size: buffer.byteLength });
    return {
      $type: 'blob' as const,
      mimeType,
      ref: { $link: `bafyblob${this.uploads.length}` },
      size: buffer.byteLength,
    };
  }

  async createPost(_credential: CredentialDocument, record: BlueskyPostRecord) {
    if (this.failWith) {
      throw this.failWith;
    }
    this.records.push(record);
    const rkey = `3k${this.records.length}`;
    return {
      cid: `bafycid${this.records.length}`,
      uri: `at://${DID}/app.bsky.feed.post/${rkey}`,
    };
  }

  async getPostRef(_credential: CredentialDocument, uri: string) {
    return { cid: 'bafyparent', uri };
  }

  listPublishVerificationPage = vi.fn();
}

describe('BlueskyPublisherService', () => {
  let publisher: BlueskyPublisherService;
  let bluesky: FakeBlueskyService;
  let patches: Array<{ id: string; data: Record<string, unknown> }>;

  beforeEach(async () => {
    bluesky = new FakeBlueskyService();
    patches = [];
    const module = await Test.createTestingModule({
      providers: [
        BlueskyPublisherService,
        {
          provide: ConfigService,
          useValue: {
            ingredientsEndpoint: 'https://cdn.genfeed.ai',
            isAuthorizedMediaDeliveryEnabled: false,
          },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: BlueskyService, useValue: bluesky },
        {
          provide: PostsService,
          useValue: {
            patch: async (id: string, data: Record<string, unknown>) => {
              patches.push({ data, id });
            },
          },
        },
      ],
    }).compile();
    publisher = module.get(BlueskyPublisherService);
  });

  describe('publish', () => {
    it('publishes text and returns the AT-URI with the bsky.app link', async () => {
      const result = await publisher.publish(makeContext());

      expect(result).toMatchObject({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: `at://${DID}/app.bsky.feed.post/3k1`,
        success: true,
        url: `https://bsky.app/profile/${DID}/post/3k1`,
      });
      expect(bluesky.records).toHaveLength(1);
      expect(bluesky.records[0]).toMatchObject({
        $type: 'app.bsky.feed.post',
        text: 'Hello Bluesky',
      });
    });

    it('sends link facets with the post', async () => {
      await publisher.publish(
        makeContext({ description: 'Read https://example.com now' }),
      );

      expect(bluesky.records[0].facets).toEqual([
        {
          features: [
            {
              $type: 'app.bsky.richtext.facet#link',
              uri: 'https://example.com',
            },
          ],
          index: { byteEnd: 24, byteStart: 5 },
        },
      ]);
    });

    it('turns HTML into plain text before posting', async () => {
      await publisher.publish(
        makeContext({ description: '<p>First</p><p>Second</p>' }),
      );

      expect(bluesky.records[0].text).toBe('First\n\nSecond');
    });

    it('uploads an image and embeds it with its aspect ratio', async () => {
      bluesky.media = {
        buffer: await sharp({
          create: { background: '#336699', channels: 3, height: 30, width: 60 },
        })
          .png()
          .toBuffer(),
        contentType: 'image/png',
      };

      const result = await publisher.publish(
        makeContext({
          category: PostCategory.IMAGE,
          ingredients: ['image-1'],
        }),
      );

      expect(result.success).toBe(true);
      expect(bluesky.records[0].embed).toEqual({
        $type: 'app.bsky.embed.images',
        images: [
          {
            alt: '',
            aspectRatio: { height: 30, width: 60 },
            image: expect.objectContaining({ mimeType: 'image/png' }),
          },
        ],
      });
    });

    it('uploads an MP4 and embeds it as a video', async () => {
      bluesky.media = {
        buffer: Buffer.from('fake mp4 bytes'),
        contentType: 'video/mp4',
      };

      const result = await publisher.publish(
        makeContext({
          category: PostCategory.VIDEO,
          ingredients: ['video-1'],
        }),
      );

      expect(result.success).toBe(true);
      expect(bluesky.records[0].embed).toMatchObject({
        $type: 'app.bsky.embed.video',
        video: { mimeType: 'video/mp4' },
      });
    });

    it('fails a non-MP4 video without retry and without posting', async () => {
      bluesky.media = {
        buffer: Buffer.from('fake webm bytes'),
        contentType: 'video/webm',
      };

      const result = await publisher.publish(
        makeContext({
          category: PostCategory.VIDEO,
          ingredients: ['video-1'],
        }),
      );

      expect(result).toMatchObject({
        error: 'Bluesky only accepts videos in MP4 format',
        errorCode: 'media_rejected',
        success: false,
      });
      expect(bluesky.records).toEqual([]);
    });

    it('fails with credential_rejected when Bluesky refuses the account', async () => {
      bluesky.failWith = new BlueskyCredentialRejectedError();

      const result = await publisher.publish(makeContext());

      expect(result).toMatchObject({
        errorCode: 'credential_rejected',
        success: false,
      });
    });

    it('rethrows a provider failure so the pipeline can retry or verify', async () => {
      bluesky.failWith = new Error('timeout of 30000ms exceeded');

      await expect(publisher.publish(makeContext())).rejects.toThrow(
        'timeout of 30000ms exceeded',
      );
    });
  });

  describe('validatePost', () => {
    const noMedia = {
      hasIngredients: false,
      ingredientIds: [],
      isCarousel: false,
      isImagePost: false,
      mediaUrls: [],
    };

    it('accepts exactly 300 characters and rejects 301', () => {
      expect(
        publisher.validatePost(
          makeContext({ description: 'a'.repeat(300) }),
          noMedia,
        ),
      ).toEqual({ valid: true });

      expect(
        publisher.validatePost(
          makeContext({ description: 'a'.repeat(301) }),
          noMedia,
        ),
      ).toEqual({
        error:
          'Bluesky caption is 301 characters; the limit is 300 characters.',
        errorCode: 'caption_too_long',
        valid: false,
      });
    });

    it('counts a family emoji as one character, as Bluesky does', () => {
      const family = '👨‍👩‍👧';

      expect(
        publisher.validatePost(
          makeContext({ description: family.repeat(300) }),
          noMedia,
        ),
      ).toEqual({ valid: true });
    });

    it('rejects more than four images', () => {
      const result = publisher.validatePost(makeContext(), {
        hasIngredients: true,
        ingredientIds: ['1', '2', '3', '4', '5'],
        isCarousel: true,
        isImagePost: true,
        mediaUrls: [],
      });

      expect(result).toMatchObject({
        error: 'Bluesky supports a maximum of 4 images per post',
        valid: false,
      });
    });

    it('rejects more than one video', () => {
      const result = publisher.validatePost(makeContext(), {
        hasIngredients: true,
        ingredientIds: ['1', '2'],
        isCarousel: true,
        isImagePost: false,
        mediaUrls: [],
      });

      expect(result).toMatchObject({
        error: 'Bluesky supports a single video per post',
        valid: false,
      });
    });

    it('rejects a post with no text and no media', () => {
      expect(
        publisher.validatePost(makeContext({ description: '  ' }), noMedia),
      ).toMatchObject({ errorCode: 'empty_post', valid: false });
    });
  });

  describe('verifyPublished', () => {
    const startedAt = new Date(Date.now() - 60_000);

    it('returns the post that carries the same text after the attempt began', async () => {
      bluesky.listPublishVerificationPage.mockResolvedValue({
        items: [
          {
            createdAt: new Date(startedAt.getTime() + 5_000),
            hasMedia: false,
            id: `at://${DID}/app.bsky.feed.post/3kfound`,
            isReply: false,
            text: 'Hello Bluesky',
            url: `https://bsky.app/profile/${DID}/post/3kfound`,
          },
        ],
        nextCursor: null,
      });

      const result = await publisher.verifyPublished(makeContext(), startedAt);

      expect(result).toMatchObject({
        externalId: `at://${DID}/app.bsky.feed.post/3kfound`,
        success: true,
        url: `https://bsky.app/profile/${DID}/post/3kfound`,
      });
    });

    it('answers null once the grace window has passed with no match', async () => {
      bluesky.listPublishVerificationPage.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      const result = await publisher.verifyPublished(
        makeContext(),
        new Date(Date.now() - 10 * 60_000),
      );

      expect(result).toBeNull();
    });

    it('stays uncertain for a post that carries media', async () => {
      await expect(
        publisher.verifyPublished(
          makeContext({ category: PostCategory.IMAGE, ingredients: ['i'] }),
          startedAt,
        ),
      ).rejects.toThrow(
        'Provider verification lacks exact text/media/thread proof',
      );
    });
  });

  describe('publishThreadChildren', () => {
    it('posts each child as a reply to the one before it', async () => {
      const parentUri = `at://${DID}/app.bsky.feed.post/3kroot`;

      await publisher.publishThreadChildren(
        makeContext(),
        [
          { description: 'Second', id: 'child-2', order: 2 },
          { description: 'First', id: 'child-1', order: 1 },
        ],
        parentUri,
      );

      expect(bluesky.records.map((record) => record.text)).toEqual([
        'First',
        'Second',
      ]);
      expect(bluesky.records[0].reply).toEqual({
        parent: { cid: 'bafyparent', uri: parentUri },
        root: { cid: 'bafyparent', uri: parentUri },
      });
      expect(bluesky.records[1].reply).toEqual({
        parent: { cid: 'bafycid1', uri: `at://${DID}/app.bsky.feed.post/3k1` },
        root: { cid: 'bafyparent', uri: parentUri },
      });
      expect(patches).toEqual([
        {
          data: expect.objectContaining({
            externalId: `at://${DID}/app.bsky.feed.post/3k1`,
            targetExecutionState: TargetExecutionState.PUBLISHED,
          }),
          id: 'child-1',
        },
        {
          data: expect.objectContaining({
            externalId: `at://${DID}/app.bsky.feed.post/3k2`,
            targetExecutionState: TargetExecutionState.PUBLISHED,
          }),
          id: 'child-2',
        },
      ]);
    });

    it('fails a reply that is over 300 characters and keeps going', async () => {
      await publisher.publishThreadChildren(
        makeContext(),
        [
          { description: 'a'.repeat(301), id: 'child-1', order: 1 },
          { description: 'Fine', id: 'child-2', order: 2 },
        ],
        `at://${DID}/app.bsky.feed.post/3kroot`,
      );

      expect(bluesky.records.map((record) => record.text)).toEqual(['Fine']);
      expect(patches.map((patch) => patch.data.targetExecutionState)).toEqual([
        TargetExecutionState.FAILED,
        TargetExecutionState.PUBLISHED,
      ]);
    });
  });

  describe('buildPostUrl', () => {
    it('builds the bsky.app link from the AT-URI', () => {
      expect(
        publisher.buildPostUrl(
          `at://${DID}/app.bsky.feed.post/3kabc`,
          credential,
        ),
      ).toBe(`https://bsky.app/profile/${DID}/post/3kabc`);
    });

    it('returns an empty link for a value that is not a post URI', () => {
      expect(publisher.buildPostUrl('3kabc', credential)).toBe('');
    });
  });
});
