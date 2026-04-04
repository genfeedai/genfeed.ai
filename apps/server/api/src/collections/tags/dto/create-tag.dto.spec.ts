import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';

describe('CreateTagDto', () => {
  it('should be defined', () => {
    expect(CreateTagDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateTagDto();
      expect(dto).toBeInstanceOf(CreateTagDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateTagDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
