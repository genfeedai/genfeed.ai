import { VideoEntity } from '@api/collections/videos/entities/video.entity';

describe('VideoEntity', () => {
  it('should be defined', () => {
    expect(VideoEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new VideoEntity();
    expect(entity).toBeInstanceOf(VideoEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new VideoEntity();
  //     // Test properties
  //   });
  // });
});
