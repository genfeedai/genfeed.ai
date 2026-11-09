import {
  isCountableVisitor,
  PublicProfileViewsService,
  profileVisitorKey,
} from '@api/endpoints/public/services/public-profile-views.service';
import type { CacheService } from '@api/services/cache/cache.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it } from 'vitest';

const BROWSER =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15';
const NOW = new Date('2026-11-09T12:00:00.000Z');

/** One public brand row and a claim store, both in memory. */
function createWorld(brand: { profileViewCount: number } | null) {
  const claims = new Set<string>();
  const row = brand
    ? { organizationId: 'org-1', profileViewCount: brand.profileViewCount }
    : null;
  const prisma = {
    brand: {
      findFirst: async () => (row ? { ...row } : null),
      updateMany: async () => {
        if (row) {
          row.profileViewCount += 1;
        }
        return { count: row ? 1 : 0 };
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
    row,
    service: new PublicProfileViewsService(cache, prisma),
  };
}

describe('PublicProfileViewsService', () => {
  it('counts a visitor once a day', async () => {
    const { row, service } = createWorld({ profileViewCount: 4 });
    const visitor = { ip: '203.0.113.7', userAgent: BROWSER };

    await expect(service.record('brand-1', visitor, NOW)).resolves.toBe(5);
    await expect(service.record('brand-1', visitor, NOW)).resolves.toBe(5);
    expect(row?.profileViewCount).toBe(5);
  });

  it('counts the same visitor again the next day', async () => {
    const { service } = createWorld({ profileViewCount: 0 });
    const visitor = { ip: '203.0.113.7', userAgent: BROWSER };

    await service.record('brand-1', visitor, NOW);

    await expect(
      service.record('brand-1', visitor, new Date('2026-11-10T08:00:00.000Z')),
    ).resolves.toBe(2);
  });

  it('shows the count to a crawler without counting it', async () => {
    const { row, service } = createWorld({ profileViewCount: 3 });

    await expect(
      service.record(
        'brand-1',
        { ip: '203.0.113.7', userAgent: 'Googlebot/2.1' },
        NOW,
      ),
    ).resolves.toBe(3);
    expect(row?.profileViewCount).toBe(3);
  });

  it('answers nothing for a profile that is not public', async () => {
    const { service } = createWorld(null);

    await expect(
      service.record('brand-1', { ip: '203.0.113.7', userAgent: BROWSER }, NOW),
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

describe('profileVisitorKey', () => {
  it('keeps the address and browser out of the key', () => {
    const key = profileVisitorKey(
      'brand-1',
      { ip: '203.0.113.7', userAgent: BROWSER },
      '2026-11-09',
    );

    expect(key).toMatch(/^public:profile-view:brand-1:[0-9a-f]{64}$/);
    expect(key).not.toContain('203.0.113.7');
  });
});
