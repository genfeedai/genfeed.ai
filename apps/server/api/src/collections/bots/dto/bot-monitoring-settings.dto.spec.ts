import { BotMonitoringSettingsDto } from '@api/collections/bots/dto/bot-monitoring-settings.dto';

describe('BotMonitoringSettingsDto', () => {
  it('should be defined', () => {
    expect(BotMonitoringSettingsDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BotMonitoringSettingsDto();
      expect(dto).toBeInstanceOf(BotMonitoringSettingsDto);
    });
  });
});
