import { AdWatchedAdvertisersModule } from '@api/collections/ad-watched-advertisers/ad-watched-advertisers.module';
import { AdWatchedAdvertisersCoreModule } from '@api/collections/ad-watched-advertisers/ad-watched-advertisers-core.module';

describe('AdWatchedAdvertisersModule', () => {
  it('should be defined', () => {
    expect(AdWatchedAdvertisersModule).toBeDefined();
  });
});

describe('AdWatchedAdvertisersCoreModule', () => {
  it('should be defined', () => {
    expect(AdWatchedAdvertisersCoreModule).toBeDefined();
  });
});
