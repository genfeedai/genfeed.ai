vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { PostVariationSourceGuard } from '@api/collections/posts/guards/post-variation-source.guard';
import type { SourcePostVariationRequest } from '@api/collections/posts/services/source-post-variation.types';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BadRequestException, type ExecutionContext } from '@nestjs/common';

describe('PostVariationSourceGuard', () => {
  const prisma = {
    post: { findFirst: vi.fn() },
    sourcePost: { findFirst: vi.fn() },
    trendSourceReference: { findFirst: vi.fn() },
  };
  let guard: PostVariationSourceGuard;

  const createContext = (body: Record<string, unknown>) => {
    const request = {
      body,
      user: {
        id: 'auth-user',
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    } as unknown as SourcePostVariationRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new PostVariationSourceGuard(prisma as unknown as PrismaService);
  });

  it('resolves an owned post under organization and brand scope before credit preflight', async () => {
    prisma.post.findFirst.mockResolvedValue({
      description: 'A source post with a complete argument.',
      id: 'post-1',
      platform: 'linkedin',
      url: 'https://example.com/post-1',
    });
    const { context, request } = createContext({
      platform: 'linkedin',
      postId: 'post-1',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(prisma.post.findFirst).toHaveBeenCalledWith({
      select: { description: true, id: true, platform: true, url: true },
      where: {
        brandId: 'brand-1',
        id: 'post-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(request.creditsOutputCount).toBe(3);
    expect(request.resolvedPostVariationSource).toMatchObject({
      id: 'post-1',
      kind: 'owned-post',
    });
  });

  it('resolves a followed source post and keeps the requested output count', async () => {
    prisma.sourcePost.findFirst.mockResolvedValue({
      id: 'source-post-1',
      platform: 'instagram',
      sourceUrl: 'https://instagram.com/p/1',
      text: 'A collected source post.',
    });
    const { context, request } = createContext({
      count: 10,
      platform: 'instagram',
      sourcePostId: 'source-post-1',
    });

    await guard.canActivate(context);

    expect(prisma.sourcePost.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          organizationId: 'org-1',
        }),
      }),
    );
    expect(request.creditsOutputCount).toBe(10);
    expect(request.resolvedPostVariationSource?.kind).toBe('source-post');
  });

  it('authorizes an imported reference only through its tenant-owned trend', async () => {
    prisma.trendSourceReference.findFirst.mockResolvedValue({
      canonicalUrl: 'https://x.com/source/status/1',
      data: { text: 'Imported source content.' },
      id: 'reference-1',
      platform: 'twitter',
    });
    const { context, request } = createContext({
      platform: 'twitter',
      sourceReferenceId: 'reference-1',
      trendId: 'trend-1',
    });

    await guard.canActivate(context);

    expect(prisma.trendSourceReference.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          links: {
            some: expect.objectContaining({
              trend: expect.objectContaining({
                brandId: 'brand-1',
                organizationId: 'org-1',
              }),
              trendId: 'trend-1',
            }),
          },
        }),
      }),
    );
    expect(request.resolvedPostVariationSource).toMatchObject({
      id: 'reference-1',
      kind: 'trend-reference',
      trendId: 'trend-1',
    });
  });

  it.each([0, 11, 2.5])(
    'rejects count %s before loading a source',
    async (count) => {
      const { context } = createContext({ count, postId: 'post-1' });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.post.findFirst).not.toHaveBeenCalled();
    },
  );

  it('rejects an unavailable or foreign source before setting credit outputs', async () => {
    prisma.post.findFirst.mockResolvedValue(null);
    const { context, request } = createContext({ postId: 'foreign-post' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Source post not found',
    );
    expect(request.creditsOutputCount).toBeUndefined();
  });
});
