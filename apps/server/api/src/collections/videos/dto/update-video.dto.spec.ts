import { UpdateVideoDto } from '@api/collections/videos/dto/update-video.dto';

describe('UpdateVideoDto', () => {
  it('should be defined', () => {
    expect(UpdateVideoDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateVideoDto();
      expect(dto).toBeInstanceOf(UpdateVideoDto);
    });
  });
});
