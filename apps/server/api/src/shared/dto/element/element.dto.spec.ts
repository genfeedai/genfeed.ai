import { ElementDto } from '@api/shared/dto/element/element.dto';

describe('ElementDto', () => {
  it('should be defined', () => {
    expect(ElementDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ElementDto();
      expect(dto).toBeInstanceOf(ElementDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new ElementDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
