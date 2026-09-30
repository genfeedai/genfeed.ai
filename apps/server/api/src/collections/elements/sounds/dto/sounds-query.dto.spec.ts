import { SoundsQueryDto } from '@api/collections/elements/sounds/dto/sounds-query.dto';

describe('SoundsQueryDto', () => {
  it('should be defined', () => {
    expect(SoundsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new SoundsQueryDto();
      expect(dto).toBeInstanceOf(SoundsQueryDto);
    });
  });
});
