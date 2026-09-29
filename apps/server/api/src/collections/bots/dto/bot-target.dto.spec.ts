import { BotTargetDto } from '@api/collections/bots/dto/bot-target.dto';

describe('BotTargetDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BotTargetDto();
      expect(dto).toBeInstanceOf(BotTargetDto);
    });
  });
});
