import { CreatePresetDto } from '@api/collections/presets/dto/create-preset.dto';

describe('CreatePresetDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreatePresetDto();
      expect(dto).toBeInstanceOf(CreatePresetDto);
    });
  });
});
