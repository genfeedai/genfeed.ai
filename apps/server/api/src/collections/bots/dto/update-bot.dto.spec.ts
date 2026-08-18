import { UpdateBotDto } from '@api/collections/bots/dto/update-bot.dto';

describe('UpdateBotDto', () => {
  it('should be defined', () => {
    expect(UpdateBotDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateBotDto();
      expect(dto).toBeInstanceOf(UpdateBotDto);
    });
  });
});
