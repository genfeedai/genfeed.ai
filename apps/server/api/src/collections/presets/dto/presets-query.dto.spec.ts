import { PresetsQueryDto } from '@api/collections/presets/dto/presets-query.dto';

describe('PresetsQueryDto', () => {
  it('should be defined', () => {
    expect(PresetsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new PresetsQueryDto();
      expect(dto).toBeInstanceOf(PresetsQueryDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new PresetsQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
