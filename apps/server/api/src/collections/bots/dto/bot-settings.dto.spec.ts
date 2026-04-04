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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new BotSettingsDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
