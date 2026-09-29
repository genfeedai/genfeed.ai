import { VideoEntity } from '@api/collections/videos/entities/video.entity';

describe('VideoEntity', () => {
  it('should create an instance', () => {
    const entity = new VideoEntity();
    expect(entity).toBeInstanceOf(VideoEntity);
  });
});
