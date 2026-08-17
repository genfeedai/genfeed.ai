import { QueryContextDto } from '@api/collections/contexts/dto/query.dto';

describe('QueryContextDto', () => {
  it('should be defined', () => {
    expect(QueryContextDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new QueryContextDto();
      expect(dto).toBeInstanceOf(QueryContextDto);
    });
  });
});
