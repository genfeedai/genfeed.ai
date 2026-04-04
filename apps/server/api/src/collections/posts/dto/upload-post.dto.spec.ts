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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UploadPostDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
