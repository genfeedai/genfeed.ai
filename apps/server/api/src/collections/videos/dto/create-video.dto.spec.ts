import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';

describe('CreateVideoDto', () => {
  it('should be defined', () => {
    expect(CreateVideoDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateVideoDto();
      expect(dto).toBeInstanceOf(CreateVideoDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateVideoDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
