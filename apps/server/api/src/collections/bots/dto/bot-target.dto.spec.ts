import { BotTargetDto } from '@api/collections/bots/dto/bot-target.dto';

describe('BotTargetDto', () => {
  it('should be defined', () => {
    expect(BotTargetDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BotTargetDto();
      expect(dto).toBeInstanceOf(BotTargetDto);
    });
  });
});
