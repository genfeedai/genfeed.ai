import { SelectModelDto } from '@api/services/router/dto/select-model.dto';

describe('SelectModelDto', () => {
  it('should be defined', () => {
    expect(SelectModelDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new SelectModelDto();
      expect(dto).toBeInstanceOf(SelectModelDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new SelectModelDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
