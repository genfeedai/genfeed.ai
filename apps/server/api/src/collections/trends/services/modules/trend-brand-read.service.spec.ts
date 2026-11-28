import {
  BRAND_NICHE_CLAIM_SECONDS,
  BRAND_READ_WINDOW_SECONDS,
  TrendBrandReadService,
} from '@api/collections/trends/services/modules/trend-brand-read.service';
import { describe, expect, it, vi } from 'vitest';

/** The cache calls this service makes, over a map with the same claim semantics as Redis. */
function setup(isAvailable = true, hasSnapshot = false) {
  const values = new Map<string, unknown>();
  const cache = {
    claimOnce: vi.fn(async (key: string) => {
      if (!isAvailable) return 'unavailable';
      if (values.has(key)) return 'duplicate';
      values.set(key, true);
      return 'claimed';
    }),
    generateKey: (...parts: string[]) => parts.join(':'),
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
      return true;
    }),
  };
  const warnings: string[] = [];
  const logger = { warn: (message: string) => warnings.push(message) };
  const niche = { hasSnapshot: async () => hasSnapshot };
  const service = new TrendBrandReadService(
    cache as never,
    logger as never,
    niche as never,
    // Outside a plan check, a scan only runs what it is given; the scan itself
    // is covered in `trend-brand-read.service.scan.spec.ts`.
    {
      runScan: (_input: unknown, run: () => Promise<unknown>) => run(),
    } as never,
  );
  return { cache, service, warnings };
}

/** The niche search runs after the read has returned. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('TrendBrandReadService', () => {
  it('remembers a read for a week, per brand', async () => {
    const { cache, service } = setup();

    await service.recordRead('org-1', 'brand-1');

    await expect(service.hasReadRecently('org-1', 'brand-1')).resolves.toBe(
      true,
    );
    await expect(service.hasReadRecently('org-1', 'brand-2')).resolves.toBe(
      false,
    );
    expect(cache.set).toHaveBeenCalledWith(
      'trends:brand-read:org-1:brand-1',
      expect.any(String),
      { tags: ['trends'], ttl: BRAND_READ_WINDOW_SECONDS },
    );
  });

  it('claims one niche search per brand, and holds the claim for half a day', async () => {
    const { cache, service } = setup();

    await expect(service.claimNicheRefresh('org-1', 'brand-1')).resolves.toBe(
      true,
    );
    await expect(service.claimNicheRefresh('org-1', 'brand-1')).resolves.toBe(
      false,
    );
    await expect(service.claimNicheRefresh('org-1', 'brand-2')).resolves.toBe(
      true,
    );
    expect(cache.claimOnce).toHaveBeenCalledWith(
      'trends:brand-niche-claim:org-1:brand-1',
      BRAND_NICHE_CLAIM_SECONDS,
      ['trends'],
    );
  });

  it('starts no search when the cache cannot say who claimed it', async () => {
    const { service } = setup(false);

    await expect(service.claimNicheRefresh('org-1', 'brand-1')).resolves.toBe(
      false,
    );
  });
});

describe('TrendBrandReadService.noteRead', () => {
  it('remembers the read and starts one niche search for a brand with none', async () => {
    const { service } = setup();
    const searched: string[] = [];
    const search = async (org: string, brand: string) => {
      searched.push(`${org}/${brand}`);
      return 12;
    };

    await service.noteRead('org-1', 'brand-1', search);
    await service.noteRead('org-1', 'brand-1', search);
    await settle();

    expect(searched).toEqual(['org-1/brand-1']);
    await expect(service.hasReadRecently('org-1', 'brand-1')).resolves.toBe(
      true,
    );
  });

  it('starts nothing when niche videos are already cached, but still remembers the read', async () => {
    const { service } = setup(true, true);
    const searched: string[] = [];

    await service.noteRead('org-1', 'brand-1', async (org, brand) => {
      searched.push(`${org}/${brand}`);
      return 1;
    });
    await settle();

    expect(searched).toEqual([]);
    await expect(service.hasReadRecently('org-1', 'brand-1')).resolves.toBe(
      true,
    );
  });

  it('starts nothing when the cache cannot say who claimed the search', async () => {
    const { service } = setup(false);
    const searched: string[] = [];

    await service.noteRead('org-1', 'brand-1', async (org, brand) => {
      searched.push(`${org}/${brand}`);
      return 1;
    });
    await settle();

    expect(searched).toEqual([]);
  });

  it('does nothing without an organization and a brand', async () => {
    const { service } = setup();

    await service.noteRead('org-1', undefined, async () => 1);
    await service.noteRead(undefined, 'brand-1', async () => 1);

    await expect(service.hasReadRecently('org-1', 'brand-1')).resolves.toBe(
      false,
    );
  });

  it('never fails the read it belongs to, and reports a failed search as a warning', async () => {
    const { service, warnings } = setup();

    await expect(
      service.noteRead('org-1', 'brand-1', async () => {
        throw new Error('no paid plan');
      }),
    ).resolves.toBeUndefined();
    await settle();

    expect(warnings).toEqual(['On-demand brand niche refresh failed']);
  });
});
