import { BotSettingsDto } from '@api/collections/bots/dto/bot-settings.dto';

describe('BotSettingsDto', () => {
  it('should be defined', () => {
    expect(BotSettingsDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BotSettingsDto();
      expect(dto).toBeInstanceOf(BotSettingsDto);
    });
  });
});
