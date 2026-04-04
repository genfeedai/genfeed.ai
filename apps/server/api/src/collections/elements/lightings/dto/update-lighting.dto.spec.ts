import { UpdateElementLightingDto } from '@api/collections/elements/lightings/dto/update-lighting.dto';

describe('UpdateElementLightingDto', () => {
  it('should be defined', () => {
    expect(UpdateElementLightingDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateElementLightingDto();
      expect(dto).toBeInstanceOf(UpdateElementLightingDto);
    });
  });
});
