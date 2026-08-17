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
  });
});
