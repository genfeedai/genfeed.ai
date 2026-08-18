import { UpdateTagDto } from '@api/collections/tags/dto/update-tag.dto';

describe('UpdateTagDto', () => {
  it('should be defined', () => {
    expect(UpdateTagDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateTagDto();
      expect(dto).toBeInstanceOf(UpdateTagDto);
    });
  });
});
