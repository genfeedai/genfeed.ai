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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new VideoEditDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
