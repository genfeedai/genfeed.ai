import { UpdateTagDto } from '@api/collections/tags/dto/update-tag.dto';

describe('UpdateTagDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateTagDto();
      expect(dto).toBeInstanceOf(UpdateTagDto);
    });
  });
});
