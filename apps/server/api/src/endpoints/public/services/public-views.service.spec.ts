import {
  isCountableVisitor,
  PublicViewsService,
  publicVisitorKey,
} from '@api/endpoints/public/services/public-views.service';
import type { CacheService } from '@api/services/cache/cache.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it } from 'vitest';

const BROWSER =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15';
const NOW = new Date('2026-11-09T12:00:00.000Z');
const VISITOR = { ip: '203.0.113.7', userAgent: BROWSER };
const PUBLIC_ARTICLES = { status: 'PUBLISHED' as const };

/** One public brand, one public article and a claim store, all in memory. */
function createWorld(
  counts: { article: number | null; profile: number | null } = {
    article: 0,
    profile: 0,
  },
) {
  const claims = new Set<string>();
  const brand =
    counts.profile === null
      ? null
      : { organizationId: 'org-1', profileViewCount: counts.profile };
  const article =
    counts.article === null
      ? null
      : { organizationId: 'org-1', viewCount: counts.article };
  const prisma = {
    article: {
      findFirst: async () => (article ? { ...article } : null),
      updateMany: async () => {
        if (article) {
          article.viewCount += 1;
        }
        return { count: article ? 1 : 0 };
      },
    },
    brand: {
      findFirst: async () => (brand ? { ...brand } : null),
      updateMany: async () => {
        if (brand) {
          brand.profileViewCount += 1;
        }
        return { count: brand ? 1 : 0 };
      },
    },
  } as unknown as PrismaService;
  const cache = {
    claimOnce: async (key: string) => {
      if (claims.has(key)) {
        return 'duplicate';
      }
      claims.add(key);
      return 'claimed';
    },
  } as unknown as CacheService;
  return {
    article,
    brand,
    service: new PublicViewsService(cache, prisma),
  };
}

describe('PublicViewsService.recordProfile', () => {
  it('counts a visitor once a day', async () => {
    const { brand, service } = createWorld({ article: 0, profile: 4 });

    await expect(service.recordProfile('brand-1', VISITOR, NOW)).resolves.toBe(
      5,
    );
    await expect(service.recordProfile('brand-1', VISITOR, NOW)).resolves.toBe(
      5,
    );
    expect(brand?.profileViewCount).toBe(5);
  });

  it('counts the same visitor again the next day', async () => {
    const { service } = createWorld();

    await service.recordProfile('brand-1', VISITOR, NOW);

    await expect(
      service.recordProfile(
        'brand-1',
        VISITOR,
        new Date('2026-11-10T08:00:00.000Z'),
      ),
    ).resolves.toBe(2);
  });

  it('shows the count to a crawler without counting it', async () => {
    const { brand, service } = createWorld({ article: 0, profile: 3 });

    await expect(
      service.recordProfile(
        'brand-1',
        { ip: '203.0.113.7', userAgent: 'Googlebot/2.1' },
        NOW,
      ),
    ).resolves.toBe(3);
    expect(brand?.profileViewCount).toBe(3);
  });

  it('answers nothing for a profile that is not public', async () => {
    const { service } = createWorld({ article: 0, profile: null });

    await expect(
      service.recordProfile('brand-1', VISITOR, NOW),
    ).resolves.toBeNull();
  });
});

describe('PublicViewsService.recordArticle', () => {
  it('counts a visitor once a day', async () => {
    const { article, service } = createWorld({ article: 9, profile: 0 });

    await expect(
      service.recordArticle('article-1', PUBLIC_ARTICLES, VISITOR, NOW),
    ).resolves.toBe(10);
    await expect(
      service.recordArticle('article-1', PUBLIC_ARTICLES, VISITOR, NOW),
    ).resolves.toBe(10);
    expect(article?.viewCount).toBe(10);
  });

  it('counts the article apart from the profile', async () => {
    const { article, brand, service } = createWorld({
      article: 0,
      profile: 0,
    });

    await service.recordProfile('shared-id', VISITOR, NOW);
    await service.recordArticle('shared-id', PUBLIC_ARTICLES, VISITOR, NOW);

    expect(brand?.profileViewCount).toBe(1);
    expect(article?.viewCount).toBe(1);
  });

  it('answers nothing for an article that is not public', async () => {
    const { service } = createWorld({ article: null, profile: 0 });

    await expect(
      service.recordArticle('article-1', PUBLIC_ARTICLES, VISITOR, NOW),
    ).resolves.toBeNull();
  });
});

describe('isCountableVisitor', () => {
  it.each([
    [{ ip: '203.0.113.7', userAgent: BROWSER }, true],
    [{ ip: '203.0.113.7', userAgent: 'facebookexternalhit/1.1' }, false],
    [{ ip: '203.0.113.7', userAgent: 'HeadlessChrome/120' }, false],
    [{ ip: '', userAgent: BROWSER }, false],
    [{ ip: '203.0.113.7', userAgent: '' }, false],
  ])('%j counts: %s', (visitor, expected) => {
    expect(isCountableVisitor(visitor)).toBe(expected);
  });
});

describe('publicVisitorKey', () => {
  it.each([
    ['profile' as const, /^public:profile-view:brand-1:[0-9a-f]{64}$/],
    ['article' as const, /^public:article-view:brand-1:[0-9a-f]{64}$/],
  ])('keeps the address and browser out of the %s key', (target, pattern) => {
    const key = publicVisitorKey(target, 'brand-1', VISITOR, '2026-11-09');

    expect(key).toMatch(pattern);
    expect(key).not.toContain('203.0.113.7');
  });
});
