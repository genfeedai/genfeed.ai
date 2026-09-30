import { UploadPostDto } from '@api/collections/posts/dto/upload-post.dto';

describe('UploadPostDto', () => {
  it('should be defined', () => {
    expect(UploadPostDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UploadPostDto();
      expect(dto).toBeInstanceOf(UploadPostDto);
    });
  });
});
