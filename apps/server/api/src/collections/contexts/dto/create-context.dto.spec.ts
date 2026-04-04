import { CreateContextDto } from '@api/collections/contexts/dto/create-context.dto';

describe('CreateContextDto', () => {
  it('should be defined', () => {
    expect(CreateContextDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateContextDto();
      expect(dto).toBeInstanceOf(CreateContextDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateContextDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
