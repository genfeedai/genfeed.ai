import { ElementDto } from '@api/shared/dto/element/element.dto';

describe('ElementDto', () => {
  it('should be defined', () => {
    expect(ElementDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ElementDto();
      expect(dto).toBeInstanceOf(ElementDto);
    });
  });
});
