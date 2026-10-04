import {
  assertPublicSlugAvailable,
  isPublicSlugUniqueViolation,
  PUBLIC_ARTICLE_SLUG_INDEX,
} from '@api/collections/articles/utils/article-slug.util';
import {
  isCrossOrgUnsafe,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';

describe('isPublicSlugUniqueViolation', () => {
  it.each([
    [{ code: 'P2002', meta: { target: ['slug'] } }],
    [{ code: 'P2002', meta: { target: PUBLIC_ARTICLE_SLUG_INDEX } }],
    [{ code: 'P2002', meta: { target: [PUBLIC_ARTICLE_SLUG_INDEX] } }],
  ])('recognizes %j', (error) => {
    expect(isPublicSlugUniqueViolation(error)).toBe(true);
  });

  it.each([
    [{ code: 'P2002', meta: { target: ['email'] } }],
    [{ code: 'P2025', meta: { target: ['slug'] } }],
    [{ code: 'P2002' }],
    [new Error('boom')],
    [null],
    ['P2002'],
  ])('ignores %j', (error) => {
    expect(isPublicSlugUniqueViolation(error)).toBe(false);
  });
});

describe('assertPublicSlugAvailable', () => {
  const guardedDelegate = (holder: { id: string } | null) => ({
    findFirst: vi.fn(async (args: unknown) => {
      assertTenantScopedQuery({
        args,
        isCloud: true,
        model: 'Article',
        operation: 'findFirst',
        tenantModelNames: new Set(['Article']),
      });
      expect(isCrossOrgUnsafe()).toBe(true);
      return holder;
    }),
  });

  it('checks the globally unique published slug outside the request tenant', async () => {
    const delegate = guardedDelegate(null);

    await expect(
      runWithTenantContext({ organizationId: 'org_1' }, () =>
        assertPublicSlugAvailable(delegate, 'launch-post', 'article_1'),
      ),
    ).resolves.toBeUndefined();

    expect(delegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 'article_1' },
          slug: 'launch-post',
          status: 'PUBLISHED',
        }),
      }),
    );
  });

  it('rejects a slug another organization already published', async () => {
    const delegate = guardedDelegate({ id: 'article_other' });

    await expect(
      runWithTenantContext({ organizationId: 'org_1' }, () =>
        assertPublicSlugAvailable(delegate, 'launch-post'),
      ),
    ).rejects.toThrow('already used by a published article');
  });
});
