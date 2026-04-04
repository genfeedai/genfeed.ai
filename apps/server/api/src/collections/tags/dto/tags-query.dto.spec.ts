import { TagsQueryDto } from '@api/collections/tags/dto/tags-query.dto';

describe('TagsQueryDto', () => {
  it('should be defined', () => {
    expect(TagsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new TagsQueryDto();
      expect(dto).toBeInstanceOf(TagsQueryDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new TagsQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
