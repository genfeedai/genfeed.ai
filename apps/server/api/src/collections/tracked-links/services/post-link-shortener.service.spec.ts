import { PostLinkShortenerService } from '@api/collections/tracked-links/services/post-link-shortener.service';
import { TrackedLinksService } from '@api/collections/tracked-links/services/tracked-links.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

describe('PostLinkShortenerService', () => {
  const caption =
    'Episode: https://youtu.be/abc, podcast https://example.com/p. http://insecure.test/x';

  const makeService = () => {
    const prisma = {
      post: { findFirst: vi.fn().mockResolvedValue({ id: 'post-1' }) },
      trackedLink: {
        create: vi.fn(({ data }) => Promise.resolve({ id: 'link-1', ...data })),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const trackedLinks = new TrackedLinksService(
      prisma as unknown as PrismaService,
    );

    return { prisma, service: new PostLinkShortenerService(trackedLinks) };
  };

  beforeEach(() => {
    vi.stubEnv('SHORT_LINK_BASE_URL', 'https://go.test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('swaps HTTPS URLs for short links and leaves unsafe ones as written', async () => {
    const { service } = makeService();

    const text = await service.shortenPostLinks({
      description: caption,
      organizationId: 'org-1',
      platform: 'twitter',
      postId: 'post-1',
    });

    expect(text).toMatch(
      /^Episode: https:\/\/go\.test\/\S{8}, podcast https:\/\/go\.test\/\S{8}\. http:\/\/insecure\.test\/x$/,
    );
  });

  it('reuses the link already created for the same post and URL', async () => {
    const { prisma, service } = makeService();
    prisma.trackedLink.findFirst.mockResolvedValue({
      id: 'link-1',
      shortUrl: 'https://go.test/KEEP1234',
    });

    const text = await service.shortenPostLinks({
      description: 'Watch https://youtu.be/abc',
      organizationId: 'org-1',
      postId: 'post-1',
    });

    expect(text).toBe('Watch https://go.test/KEEP1234');
    expect(prisma.trackedLink.create).not.toHaveBeenCalled();
  });

  it('does not shorten an already-short link', async () => {
    const { service } = makeService();

    const text = await service.shortenPostLinks({
      description: 'Watch https://go.test/KEEP1234',
      organizationId: 'org-1',
      postId: 'post-1',
    });

    expect(text).toBe('Watch https://go.test/KEEP1234');
  });

  it('returns a caption without URLs unchanged', async () => {
    const { service } = makeService();

    const text = await service.shortenPostLinks({
      description: 'No links here',
      organizationId: 'org-1',
      postId: 'post-1',
    });

    expect(text).toBe('No links here');
  });

  it('leaves a URL as written when its link cannot be created', async () => {
    const { prisma, service } = makeService();
    prisma.trackedLink.findFirst.mockRejectedValue(new Error('db down'));

    const text = await service.shortenPostLinks({
      description: 'Watch https://youtu.be/abc',
      organizationId: 'org-1',
      postId: 'post-1',
    });

    expect(text).toBe('Watch https://youtu.be/abc');
  });
});
