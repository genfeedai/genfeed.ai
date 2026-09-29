import { BotSettingsDto } from '@api/collections/bots/dto/bot-settings.dto';

describe('BotSettingsDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BotSettingsDto();
      expect(dto).toBeInstanceOf(BotSettingsDto);
    });
  });
});
