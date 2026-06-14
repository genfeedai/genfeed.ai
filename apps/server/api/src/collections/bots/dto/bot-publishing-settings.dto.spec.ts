import { BotPublishingSettingsDto } from '@api/collections/bots/dto/bot-publishing-settings.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('BotPublishingSettingsDto', () => {
  it('should be defined', () => {
    expect(BotPublishingSettingsDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BotPublishingSettingsDto();
      expect(dto).toBeInstanceOf(BotPublishingSettingsDto);
    });

    describe('scheduledTimes', () => {
      it('accepts valid HH:mm times', async () => {
        const dto = plainToInstance(BotPublishingSettingsDto, {
          scheduledTimes: ['00:00', '09:30', '23:59'],
        });

        const errors = await validate(dto);

        expect(errors).toHaveLength(0);
      });

      it('rejects times missing the colon separator', async () => {
        const dto = plainToInstance(BotPublishingSettingsDto, {
          scheduledTimes: ['0930'],
        });

        const errors = await validate(dto);

        expect(errors.length).toBeGreaterThan(0);
        expect(JSON.stringify(errors)).toContain(
          'scheduledTimes must be HH:mm (24h)',
        );
      });

      it('rejects hours above 23', async () => {
        const dto = plainToInstance(BotPublishingSettingsDto, {
          scheduledTimes: ['24:00'],
        });

        const errors = await validate(dto);

        expect(errors.length).toBeGreaterThan(0);
        expect(JSON.stringify(errors)).toContain(
          'scheduledTimes must be HH:mm (24h)',
        );
      });

      it('rejects minutes above 59', async () => {
        const dto = plainToInstance(BotPublishingSettingsDto, {
          scheduledTimes: ['12:60'],
        });

        const errors = await validate(dto);

        expect(errors.length).toBeGreaterThan(0);
        expect(JSON.stringify(errors)).toContain(
          'scheduledTimes must be HH:mm (24h)',
        );
      });

      it('rejects free-form time strings', async () => {
        const dto = plainToInstance(BotPublishingSettingsDto, {
          scheduledTimes: ['9am', 'noon', '3:00pm'],
        });

        const errors = await validate(dto);

        expect(errors.length).toBeGreaterThan(0);
        expect(JSON.stringify(errors)).toContain(
          'scheduledTimes must be HH:mm (24h)',
        );
      });

      it('accepts an empty array', async () => {
        const dto = plainToInstance(BotPublishingSettingsDto, {
          scheduledTimes: [],
        });

        const errors = await validate(dto);

        expect(errors).toHaveLength(0);
      });
    });
  });
});
