import { CreateSettingDto } from '@api/collections/settings/dto/create-setting.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function localeErrorsFor(locale: unknown) {
  const dto = plainToInstance(CreateSettingDto, { locale });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'locale');
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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateSettingDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
