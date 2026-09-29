import { SoundsQueryDto } from '@api/collections/elements/sounds/dto/sounds-query.dto';

describe('SoundsQueryDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new SoundsQueryDto();
      expect(dto).toBeInstanceOf(SoundsQueryDto);
    });
  });
});
