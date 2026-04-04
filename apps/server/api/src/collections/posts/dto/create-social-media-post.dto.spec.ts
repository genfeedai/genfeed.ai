import { CreateSocialMediaPostDto } from '@api/collections/posts/dto/create-social-media-post.dto';

describe('CreateSocialMediaPostDto', () => {
  it('should be defined', () => {
    expect(CreateSocialMediaPostDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateSocialMediaPostDto();
      expect(dto).toBeInstanceOf(CreateSocialMediaPostDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateSocialMediaPostDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
