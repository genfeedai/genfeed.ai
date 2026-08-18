import { AutoCreateContextDto } from '@api/collections/contexts/dto/autocreate.dto';

describe('AutoCreateContextDto', () => {
  it('should be defined', () => {
    expect(AutoCreateContextDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new AutoCreateContextDto();
      expect(dto).toBeInstanceOf(AutoCreateContextDto);
    });
  });
});
