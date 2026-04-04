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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateVideoDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
