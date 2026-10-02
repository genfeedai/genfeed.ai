import { listPostContentMentions } from '@api/collections/posts/services/post-content-mentions.read';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

describe('canonical post content mentions', () => {
  const row = {
    id: 'post',
    brandId: 'brand',
    category: 'ARTICLE',
    description: ' description ',
    label: ' ',
    entityArticle: {
      label: ' Article ',
      coverImageUrl: 'cover' as string | null,
    },
    entityIngredient: {
      cdnUrl: 'image' as string | null,
      sampleAudioUrl: 'audio',
    },
  };
  function setup(rows = [row]) {
    const findMany = vi.fn().mockResolvedValue(rows);
    return {
      findMany,
      prisma: { post: { findMany } } as unknown as PrismaService,
    };
  }
  it('uses exact scoped selection and the existing default 50', async () => {
    const { prisma, findMany } = setup();
    expect(await listPostContentMentions(prisma, 'org', 'brand')).toEqual([
      {
        id: 'post',
        brandId: 'brand',
        contentType: 'article',
        contentTitle: 'Article',
        thumbnailUrl: 'cover',
      },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org', brandId: 'brand', isDeleted: false },
      take: 50,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        brandId: true,
        category: true,
        description: true,
        entityArticle: { select: { coverImageUrl: true, label: true } },
        entityIngredient: { select: { cdnUrl: true, sampleAudioUrl: true } },
        id: true,
        label: true,
      },
    });
  });
  it.each([
    { input: 0, take: 1 },
    { input: 101, take: 100 },
  ])('clamps $input to $take', async ({ input, take }) => {
    const { prisma, findMany } = setup();
    await listPostContentMentions(prisma, 'org', undefined, input);
    expect(findMany.mock.calls[0][0].take).toBe(take);
  });
  it('does not query without an organization', async () => {
    const { prisma, findMany } = setup();
    expect(await listPostContentMentions(prisma, '')).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('preserves title boundaries and fallback thumbnail order', async () => {
    const { prisma } = setup([
      { ...row, label: 'a'.repeat(80) },
      {
        ...row,
        label: 'a'.repeat(81),
        entityArticle: { label: 'ignored', coverImageUrl: null },
        entityIngredient: { cdnUrl: null, sampleAudioUrl: 'audio' },
      },
    ]);
    const result = await listPostContentMentions(prisma, 'org');
    expect(result[0].contentTitle).toBe('a'.repeat(80));
    expect(result[1].contentTitle).toBe(`${'a'.repeat(77)}...`);
    expect(result[1].thumbnailUrl).toBe('audio');
  });
});
