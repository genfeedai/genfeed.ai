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
  });
});
