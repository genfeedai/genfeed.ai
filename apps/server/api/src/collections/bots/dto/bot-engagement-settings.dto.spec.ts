import { BotEngagementSettingsDto } from '@api/collections/bots/dto/bot-engagement-settings.dto';

describe('BotEngagementSettingsDto', () => {
  it('should be defined', () => {
    expect(BotEngagementSettingsDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BotEngagementSettingsDto();
      expect(dto).toBeInstanceOf(BotEngagementSettingsDto);
    });
  });
});
