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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new QueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
