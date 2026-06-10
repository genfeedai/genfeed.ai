import { BotPublishingSettingsDto } from '@api/collections/bots/dto/bot-publishing-settings.dto';

describe('BotPublishingSettingsDto', () => {
  it('should be defined', () => {
    expect(BotPublishingSettingsDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BotPublishingSettingsDto();
      expect(dto).toBeInstanceOf(BotPublishingSettingsDto);
    });
  });
});
