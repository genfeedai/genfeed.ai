import { CreatePresetDto } from '@api/collections/presets/dto/create-preset.dto';

describe('CreatePresetDto', () => {
  it('should be defined', () => {
    expect(CreatePresetDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreatePresetDto();
      expect(dto).toBeInstanceOf(CreatePresetDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreatePresetDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
