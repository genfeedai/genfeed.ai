import { OutlierCreatorReaderService } from '@api/collections/outlier-library/readers/outlier-creator-reader.service';
import { currentApifyCaller } from '@api/services/integrations/apify/utils/apify-caller.context';
import { Platform, SocialSourcePlatform } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const PUBLISHED = new Date('2026-11-20T10:00:00.000Z');

function reader(options: {
  account?: boolean;
  instagramPosts?: unknown[];
  tiktokPosts?: unknown[];
}) {
  const callers: string[] = [];
  const service = new OutlierCreatorReaderService(
    {
      collectTimeline: async () => {
        callers.push(currentApifyCaller());
        return { posts: options.tiktokPosts ?? [] };
      },
    } as never,
    {
      collectTimeline: async (
        _platform: SocialSourcePlatform,
        _handle: string,
        context: object,
      ) => ({ context, posts: options.instagramPosts ?? [] }),
    } as never,
    {
      getSingleton: async () =>
        options.account
          ? {
              outlierLibraryInstagramBrandId: 'brand',
              outlierLibraryInstagramCredentialId: 'credential',
              outlierLibraryInstagramOrganizationId: 'org',
            }
          : {},
    } as never,
  );
  return { callers, service };
}

describe('OutlierCreatorReaderService', () => {
  it('reads TikTok under the weekly read caller name and keeps only posts with an id, a link and a date', async () => {
    const { callers, service } = reader({
      tiktokPosts: [
        {
          contentUrl: 'https://tiktok.test/v/1',
          createdAt: PUBLISHED,
          id: '1',
          metrics: { comments: 3, likes: 40, views: 1_000 },
          text: 'caption',
        },
        { id: '2', text: 'no link and no date' },
      ],
    });

    const posts = await service.read({
      handle: 'dancer',
      platform: Platform.TIKTOK,
    });

    expect(callers).toEqual(['outlier-library.weekly-read']);
    expect(posts).toEqual([
      expect.objectContaining({
        comments: 3,
        externalId: '1',
        likes: 40,
        url: 'https://tiktok.test/v/1',
        views: 1_000,
      }),
    ]);
  });

  it('waits on Instagram until the reader account is set, and never reads YouTube yet', async () => {
    const without = reader({});
    const withAccount = reader({ account: true });

    expect(await without.service.canRead(Platform.INSTAGRAM)).toBe(false);
    expect(await withAccount.service.canRead(Platform.INSTAGRAM)).toBe(true);
    expect(await withAccount.service.canRead(Platform.YOUTUBE)).toBe(false);
    await expect(
      without.service.read({ handle: 'x', platform: Platform.INSTAGRAM }),
    ).rejects.toThrow('No Instagram reader account');
  });
});
