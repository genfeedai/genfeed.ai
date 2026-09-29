import { TagsQueryDto } from '@api/collections/tags/dto/tags-query.dto';

describe('TagsQueryDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new TagsQueryDto();
      expect(dto).toBeInstanceOf(TagsQueryDto);
    });
  });
});
