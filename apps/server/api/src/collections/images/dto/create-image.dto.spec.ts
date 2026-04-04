import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';

describe('CreateImageDto', () => {
  it('should be defined', () => {
    expect(CreateImageDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateImageDto();
      expect(dto).toBeInstanceOf(CreateImageDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateImageDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
