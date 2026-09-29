import { VideoEditDto } from '@api/collections/videos/dto/video-edit.dto';

describe('VideoEditDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new VideoEditDto();
      expect(dto).toBeInstanceOf(VideoEditDto);
    });
  });
});
