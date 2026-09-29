import { AutoCreateContextDto } from '@api/collections/contexts/dto/autocreate.dto';

describe('AutoCreateContextDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new AutoCreateContextDto();
      expect(dto).toBeInstanceOf(AutoCreateContextDto);
    });
  });
});
