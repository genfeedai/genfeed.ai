import { UpdateBotDto } from '@api/collections/bots/dto/update-bot.dto';

describe('UpdateBotDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateBotDto();
      expect(dto).toBeInstanceOf(UpdateBotDto);
    });
  });
});
