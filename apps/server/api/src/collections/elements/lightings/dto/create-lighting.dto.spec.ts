import { CreateElementLightingDto } from '@api/collections/elements/lightings/dto/create-lighting.dto';

describe('CreateElementLightingDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateElementLightingDto();
      expect(dto).toBeInstanceOf(CreateElementLightingDto);
    });
  });
});
