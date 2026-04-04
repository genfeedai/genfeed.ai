import { CreateModelDto } from '@api/collections/models/dto/create-model.dto';

describe('CreateModelDto', () => {
  it('should be defined', () => {
    expect(CreateModelDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateModelDto();
      expect(dto).toBeInstanceOf(CreateModelDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateModelDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
