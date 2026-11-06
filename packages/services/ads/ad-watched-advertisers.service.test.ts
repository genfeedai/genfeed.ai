import { AdsPlatform } from '@genfeedai/contracts/interfaces';
import {
  type FakeJsonApiResource,
  installFakeJsonApiResource,
} from '@services/__mocks__/http.mock';
import { AdWatchedAdvertisersService } from '@services/ads/ad-watched-advertisers.service';
import { describe, expect, it } from 'vitest';

const NIKE = {
  advertiserHandle: 'nike',
  advertiserName: 'Nike',
  brandId: 'brand-1',
  freshnessState: 'fresh',
  id: 'watched-1',
  lastSnapshotRecordCount: 12,
  platform: 'meta',
};
const ADIDAS = {
  advertiserHandle: 'adidas',
  brandId: 'brand-2',
  freshnessState: 'stale',
  id: 'watched-2',
  platform: 'meta',
};

function createService(): {
  server: FakeJsonApiResource;
  service: AdWatchedAdvertisersService;
} {
  const service = new AdWatchedAdvertisersService('test-token');
  const server = installFakeJsonApiResource(service, {
    rows: [NIKE, ADIDAS],
    type: 'ad-watched-advertisers',
  });

  return { server, service };
}

describe('AdWatchedAdvertisersService', () => {
  it('lists watched competitors scoped to a brand (#3537)', async () => {
    const { service } = createService();

    const result = await service.list({ brandId: 'brand-1' });

    expect(result).toEqual([
      {
        advertiserHandle: 'nike',
        advertiserName: 'Nike',
        brandId: 'brand-1',
        freshnessState: 'fresh',
        id: 'watched-1',
        lastSnapshotRecordCount: 12,
        platform: AdsPlatform.META,
      },
    ]);
  });

  it('omits an absent brand rather than sending an empty filter (#3537)', async () => {
    const { service } = createService();

    const result = await service.list({});

    expect(result.map((watched) => watched.id)).toEqual([
      'watched-1',
      'watched-2',
    ]);
  });

  it('creates a watched competitor from a handle and platform (#3537)', async () => {
    const { server, service } = createService();

    const result = await service.create({
      advertiserHandle: 'gymshark',
      brandId: 'brand-1',
      platform: AdsPlatform.TIKTOK,
    });

    expect(result).toMatchObject({
      advertiserHandle: 'gymshark',
      brandId: 'brand-1',
      id: 'ad-watched-advertisers-3',
      platform: 'tiktok',
    });
    expect(server.rows).toHaveLength(3);
    expect(
      (await service.list({ brandId: 'brand-1' })).map((w) => w.id),
    ).toEqual(['watched-1', 'ad-watched-advertisers-3']);
  });

  it('removes a watched competitor by id (#3537)', async () => {
    const { server, service } = createService();

    await service.remove('watched-1');

    expect(server.rows).toEqual([ADIDAS]);
  });
});
