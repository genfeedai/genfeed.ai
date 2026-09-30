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
  });
});
