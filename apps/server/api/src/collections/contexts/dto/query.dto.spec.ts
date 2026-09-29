import { QueryContextDto } from '@api/collections/contexts/dto/query.dto';

describe('QueryContextDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new QueryContextDto();
      expect(dto).toBeInstanceOf(QueryContextDto);
    });
  });
});
