import { BotEngagementSettingsDto } from '@api/collections/bots/dto/bot-engagement-settings.dto';

describe('BotEngagementSettingsDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BotEngagementSettingsDto();
      expect(dto).toBeInstanceOf(BotEngagementSettingsDto);
    });
  });
});
