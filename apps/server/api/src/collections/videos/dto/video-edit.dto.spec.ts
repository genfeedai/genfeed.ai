import { VideoEditDto } from '@api/collections/videos/dto/video-edit.dto';

describe('VideoEditDto', () => {
  it('should be defined', () => {
    expect(VideoEditDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new VideoEditDto();
      expect(dto).toBeInstanceOf(VideoEditDto);
    });
  });
});
