import { SoundsQueryDto } from '@api/collections/elements/sounds/dto/sounds-query.dto';

describe('SoundsQueryDto', () => {
  it('should be defined', () => {
    expect(SoundsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new SoundsQueryDto();
      expect(dto).toBeInstanceOf(SoundsQueryDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new SoundsQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
