import { CreateTweetReplyDto } from '@api/collections/prompts/dto/create-tweet-reply.dto';

describe('CreateTweetReplyDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateTweetReplyDto();
      expect(dto).toBeInstanceOf(CreateTweetReplyDto);
    });
  });
});
