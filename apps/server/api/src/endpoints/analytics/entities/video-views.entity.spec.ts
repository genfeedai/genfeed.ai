import { VideoViewsEntity } from '@api/endpoints/analytics/entities/video-views.entity';

describe('VideoViewsEntity', () => {
  it('should be defined', () => {
    expect(new VideoViewsEntity({})).toBeDefined();
  });
});
