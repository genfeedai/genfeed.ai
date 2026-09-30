import { CreateBotDto } from '@api/collections/bots/dto/create-bot.dto';

describe('CreateBotDto', () => {
  it('should be defined', () => {
    expect(CreateBotDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateBotDto();
      expect(dto).toBeInstanceOf(CreateBotDto);
    });
  });
});
