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
  });
});
