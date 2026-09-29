import { UploadPostDto } from '@api/collections/posts/dto/upload-post.dto';

describe('UploadPostDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UploadPostDto();
      expect(dto).toBeInstanceOf(UploadPostDto);
    });
  });
});
