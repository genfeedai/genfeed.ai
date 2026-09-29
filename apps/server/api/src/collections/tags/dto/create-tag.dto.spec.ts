import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';

describe('CreateTagDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateTagDto();
      expect(dto).toBeInstanceOf(CreateTagDto);
    });
  });
});
