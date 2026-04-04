import { UpdateContextDto } from '@api/collections/contexts/dto/update-context.dto';

describe('UpdateContextDto', () => {
  it('should be defined', () => {
    expect(UpdateContextDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateContextDto();
      expect(dto).toBeInstanceOf(UpdateContextDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateContextDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
