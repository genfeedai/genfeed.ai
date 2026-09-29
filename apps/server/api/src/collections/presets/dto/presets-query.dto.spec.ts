import { PresetsQueryDto } from '@api/collections/presets/dto/presets-query.dto';

describe('PresetsQueryDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new PresetsQueryDto();
      expect(dto).toBeInstanceOf(PresetsQueryDto);
    });
  });
});
