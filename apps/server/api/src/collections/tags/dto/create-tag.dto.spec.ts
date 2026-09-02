import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';

describe('CreateTagDto', () => {
  it('should be defined', () => {
    expect(CreateTagDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateTagDto();
      expect(dto).toBeInstanceOf(CreateTagDto);
    });
  });
});
