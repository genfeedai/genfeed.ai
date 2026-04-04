import { UpdateImageDto } from '@api/collections/images/dto/update-image.dto';

describe('UpdateImageDto', () => {
  it('should be defined', () => {
    expect(UpdateImageDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateImageDto();
      expect(dto).toBeInstanceOf(UpdateImageDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateImageDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
