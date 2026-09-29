import { UpdateElementLightingDto } from '@api/collections/elements/lightings/dto/update-lighting.dto';

describe('UpdateElementLightingDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateElementLightingDto();
      expect(dto).toBeInstanceOf(UpdateElementLightingDto);
    });
  });
});
