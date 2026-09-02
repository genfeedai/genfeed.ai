import { CreateSettingDto } from '@api/collections/settings/dto/create-setting.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function localeErrorsFor(locale: unknown) {
  const dto = plainToInstance(CreateSettingDto, { locale });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'locale');
}

async function themeErrorsFor(theme: unknown) {
  const dto = plainToInstance(CreateSettingDto, { theme });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'theme');
}

describe('CreateSettingDto', () => {
  it('should be defined', () => {
    expect(CreateSettingDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateSettingDto();
      expect(dto).toBeInstanceOf(CreateSettingDto);
    });

    it('accepts a supported locale', async () => {
      expect(await localeErrorsFor('en-XA')).toEqual([]);
    });

    it('accepts an omitted locale', async () => {
      expect(await localeErrorsFor(undefined)).toEqual([]);
    });

    it('rejects a locale outside the allowlist', async () => {
      // The column is TEXT, so the allowlist is the only thing standing between
      // a typo and a request that renders against a catalog that does not exist.
      const localeErrors = await localeErrorsFor('de');

      expect(localeErrors).toHaveLength(1);
      expect(localeErrors[0]?.constraints).toHaveProperty('isIn');
    });

    it.each(['system', 'light', 'dark'])(
      'accepts the %s theme preference',
      async (theme) => {
        expect(await themeErrorsFor(theme)).toEqual([]);
      },
    );

    it('rejects a theme outside the shared allowlist', async () => {
      const themeErrors = await themeErrorsFor('solarized');

      expect(themeErrors).toHaveLength(1);
      expect(themeErrors[0]?.constraints).toHaveProperty('isIn');
    });

    it('accepts a boolean video email preference', async () => {
      const dto = plainToInstance(CreateSettingDto, {
        isVideoNotificationsEmail: true,
      });
      const errors = await validate(dto);

      expect(
        errors.filter(
          (error) => error.property === 'isVideoNotificationsEmail',
        ),
      ).toEqual([]);
    });

    it('rejects a non-boolean video email preference', async () => {
      const dto = plainToInstance(CreateSettingDto, {
        isVideoNotificationsEmail: 'yes',
      });
      const errors = await validate(dto);
      const videoEmailErrors = errors.filter(
        (error) => error.property === 'isVideoNotificationsEmail',
      );

      expect(videoEmailErrors).toHaveLength(1);
      expect(videoEmailErrors[0]?.constraints).toHaveProperty('isBoolean');
    });
  });
});
