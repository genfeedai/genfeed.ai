import { CreateTweetReplyDto } from '@api/collections/prompts/dto/create-tweet-reply.dto';

describe('CreateTweetReplyDto', () => {
  it('should be defined', () => {
    expect(CreateTweetReplyDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateTweetReplyDto();
      expect(dto).toBeInstanceOf(CreateTweetReplyDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateTweetReplyDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
