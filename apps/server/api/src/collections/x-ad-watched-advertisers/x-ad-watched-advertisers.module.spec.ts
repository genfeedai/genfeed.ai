import { XAdWatchedAdvertisersModule } from '@api/collections/x-ad-watched-advertisers/x-ad-watched-advertisers.module';
import { XAdWatchedAdvertisersCoreModule } from '@api/collections/x-ad-watched-advertisers/x-ad-watched-advertisers-core.module';

describe('XAdWatchedAdvertisersModule', () => {
  it('should be defined', () => {
    expect(XAdWatchedAdvertisersModule).toBeDefined();
  });
});

describe('XAdWatchedAdvertisersCoreModule', () => {
  it('should be defined', () => {
    expect(XAdWatchedAdvertisersCoreModule).toBeDefined();
  });
});
