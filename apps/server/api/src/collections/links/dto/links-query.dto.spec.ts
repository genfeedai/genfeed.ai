import { LinksQueryDto } from '@api/collections/links/dto/links-query.dto';

describe('LinksQueryDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new LinksQueryDto();
      expect(dto).toBeInstanceOf(LinksQueryDto);
    });
  });
});
