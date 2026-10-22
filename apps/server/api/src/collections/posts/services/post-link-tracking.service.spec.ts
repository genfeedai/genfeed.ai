import { PostLinkTrackingService } from '@api/collections/posts/services/post-link-tracking.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeMetadataService } from '@api/services/integrations/youtube/services/modules/youtube-metadata.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import { testId } from '@helpers/testing/test-id.helper';
import { Test } from '@nestjs/testing';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

const scope = {
  organizationId: testId('org'),
  userId: testId('user'),
  brandId: testId('brand'),
};
const input = { brandId: scope.brandId, url: 'https://x.com/alice/status/123' };
const credential = {
  id: testId('credential'),
  externalId: 'alice-id',
  externalHandle: 'alice',
  username: 'alice',
  isConnected: true,
};

async function fixture() {
  const rows: Array<Prisma.PostUncheckedCreateInput & { id: string }> = [];
  const tx = {
    brand: { findFirst: vi.fn().mockResolvedValue({ id: scope.brandId }) },
    credential: { findMany: vi.fn().mockResolvedValue([credential]) },
    post: {
      findMany: vi.fn(async () => rows),
      create: vi.fn(
        async ({ data }: { data: Prisma.PostUncheckedCreateInput }) => {
          const row = { id: testId('post'), ...data };
          rows.push(row);
          return row;
        },
      ),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(
      async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const twitter = {
    getTweetById: vi.fn().mockResolvedValue({
      id: '123',
      authorId: 'alice-id',
      authorUsername: 'alice',
      text: 'Original post',
      createdAt: '2026-01-01T00:00:00.000Z',
      url: input.url,
    }),
  };
  const youtube = {
    getVideoMetadata: vi.fn().mockResolvedValue({
      id: 'abc',
      channelId: 'channel-alice',
      title: 'Original video',
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
  };
  const module = await Test.createTestingModule({
    providers: [
      PostLinkTrackingService,
      { provide: PrismaService, useValue: prisma },
      { provide: TwitterService, useValue: twitter },
      { provide: YoutubeMetadataService, useValue: youtube },
    ],
  }).compile();
  return {
    service: module.get(PostLinkTrackingService),
    prisma,
    tx,
    twitter,
    youtube,
  };
}

describe('post link import', () => {
  it('links an owned X post, preserves import provenance, schedules analytics and replays idempotently', async () => {
    const f = await fixture();
    expect(await f.service.trackLink(input, scope)).toMatchObject({
      created: true,
      credentialId: credential.id,
      analyticsAvailability: 'eligible',
      source: 'extension',
    });
    expect(f.tx.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isAnalyticsEnabled: true,
        analyticsNextCollectAt: expect.any(Date),
        description: 'Original post',
        targetSettings: expect.objectContaining({
          extensionCapture: expect.objectContaining({
            origin: 'link',
            version: 1,
          }),
        }),
      }),
    });
    expect(await f.service.trackLink(input, scope)).toMatchObject({
      created: false,
      postId: testId('post'),
    });
    expect(f.tx.post.create).toHaveBeenCalledTimes(1);
    expect(f.tx.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
        }),
      }),
    );
  });
  it('falls back from a failed brand credential read to the app client', async () => {
    const f = await fixture();
    f.twitter.getTweetById.mockRejectedValueOnce(new Error('expired token'));
    await f.service.trackLink(input, scope);
    expect(f.twitter.getTweetById).toHaveBeenNthCalledWith(1, '123', {
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      credentialId: credential.id,
    });
    expect(f.twitter.getTweetById).toHaveBeenNthCalledWith(2, '123');
  });
  it('uses the app client without an available credential', async () => {
    const f = await fixture();
    f.tx.credential.findMany.mockResolvedValue([]);
    expect(await f.service.trackLink(input, scope)).toMatchObject({
      credentialId: null,
      analyticsAvailability: 'missing-credential',
    });
    expect(f.twitter.getTweetById).toHaveBeenCalledWith('123');
  });
  it('does not guess between ambiguous matching credentials', async () => {
    const f = await fixture();
    f.tx.credential.findMany.mockResolvedValue([
      credential,
      { ...credential, id: testId('credential-2') },
    ]);
    expect(await f.service.trackLink(input, scope)).toMatchObject({
      credentialId: null,
      analyticsAvailability: 'missing-credential',
    });
  });
  it('does not attach a different author to the connected account', async () => {
    const f = await fixture();
    f.tx.credential.findMany.mockResolvedValue([
      { ...credential, externalId: 'bob-id' },
    ]);
    expect(await f.service.trackLink(input, scope)).toMatchObject({
      credentialId: null,
      analyticsAvailability: 'missing-credential',
    });
  });
  it('reports provider failures without creating a post', async () => {
    const f = await fixture();
    f.twitter.getTweetById.mockRejectedValue(new Error('private'));
    await expect(f.service.trackLink(input, scope)).rejects.toThrow(
      "Couldn't read",
    );
    expect(f.tx.post.create).not.toHaveBeenCalled();
  });
  it('imports a YouTube video using its channel identity', async () => {
    const f = await fixture();
    f.tx.credential.findMany.mockResolvedValue([
      { ...credential, externalId: 'channel-alice' },
    ]);
    expect(
      await f.service.trackLink(
        { ...input, url: 'https://youtu.be/abc' },
        scope,
      ),
    ).toMatchObject({
      credentialId: credential.id,
      analyticsAvailability: 'eligible',
    });
    expect(f.tx.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ description: 'Original video' }),
    });
  });
  it('rejects unavailable or private YouTube videos', async () => {
    const f = await fixture();
    f.youtube.getVideoMetadata.mockResolvedValue(null);
    await expect(
      f.service.trackLink({ ...input, url: 'https://youtu.be/abc' }, scope),
    ).rejects.toThrow('private');
    expect(f.tx.post.create).not.toHaveBeenCalled();
  });
  it.each([
    'https://linkedin.com/posts/alice_topic-activity-123-xyz',
    'https://linkedin.com/feed/update/urn:li:share:123',
    'https://linkedin.com/feed/update/urn:li:ugcPost:123',
    'https://linkedin.com/pulse/hello-alice',
  ])(
    'keeps LinkedIn link-only, including direct URNs and articles: %s',
    async (url) => {
      const f = await fixture();
      const result = await f.service.trackLink(
        {
          ...input,
          url,
          title: 'LinkedIn title',
          publishedAt: '2026-01-01T00:00:00.000Z',
        },
        scope,
      );
      expect(result.analyticsAvailability).toBe('api-access-required');
      expect(f.tx.post.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isAnalyticsEnabled: false,
          description: 'LinkedIn title',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      });
      expect(f.twitter.getTweetById).not.toHaveBeenCalled();
      expect(f.youtube.getVideoMetadata).not.toHaveBeenCalled();
      if (url.includes('urn:li:share'))
        expect(result.externalId).toBe('urn:li:share:123');
      if (url.includes('urn:li:ugcPost'))
        expect(result.externalId).toBe('urn:li:ugcPost:123');
    },
  );
  it('derives LinkedIn date and author from the activity URL', async () => {
    const f = await fixture();
    const date = new Date('2026-02-03T04:05:06.000Z');
    const id = (BigInt(date.getTime()) << 22n).toString();
    await f.service.trackLink(
      {
        ...input,
        url: `https://linkedin.com/posts/alice_topic-activity-${id}-xyz`,
      },
      scope,
    );
    expect(f.tx.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publishedAt: date,
        credentialId: credential.id,
      }),
    });
  });
  it('rejects cross-tenant and cross-brand requests before reading any provider', async () => {
    const f = await fixture();
    f.tx.brand.findFirst.mockResolvedValue(null);
    await expect(f.service.trackLink(input, scope)).rejects.toThrow(
      'unavailable',
    );
    await expect(
      f.service.trackLink(input, { ...scope, brandId: testId('other-brand') }),
    ).rejects.toThrow('brand context');
    expect(f.twitter.getTweetById).not.toHaveBeenCalled();
    expect(f.tx.post.create).not.toHaveBeenCalled();
    expect(f.tx.brand.findFirst).toHaveBeenCalledWith({
      where: {
        id: scope.brandId,
        organizationId: scope.organizationId,
        isDeleted: false,
      },
      select: { id: true },
    });
  });
});
