import { UpdatePresetDto } from '@api/collections/presets/dto/update-preset.dto';

describe('UpdatePresetDto', () => {
  it('should be defined', () => {
    expect(UpdatePresetDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdatePresetDto();
      expect(dto).toBeInstanceOf(UpdatePresetDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdatePresetDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
