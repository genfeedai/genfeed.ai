import { BotPublishingSettingsDto } from '@api/collections/bots/dto/bot-publishing-settings.dto';

describe('BotPublishingSettingsDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BotPublishingSettingsDto();
      expect(dto).toBeInstanceOf(BotPublishingSettingsDto);
    });
  });
});
