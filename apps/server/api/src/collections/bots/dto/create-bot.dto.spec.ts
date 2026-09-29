import { CreateBotDto } from '@api/collections/bots/dto/create-bot.dto';

describe('CreateBotDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateBotDto();
      expect(dto).toBeInstanceOf(CreateBotDto);
    });
  });
});
