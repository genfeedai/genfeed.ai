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
  });
});
