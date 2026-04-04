import { LinksQueryDto } from '@api/collections/links/dto/links-query.dto';

describe('LinksQueryDto', () => {
  it('should be defined', () => {
    expect(LinksQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new LinksQueryDto();
      expect(dto).toBeInstanceOf(LinksQueryDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new LinksQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
