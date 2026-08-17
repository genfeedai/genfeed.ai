import { CreateOrganizationSettingDto } from '@api/collections/organization-settings/dto/create-organization-setting.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function defaultLocaleErrorsFor(defaultLocale: unknown) {
  const dto = plainToInstance(CreateOrganizationSettingDto, { defaultLocale });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'defaultLocale');
}

describe('CreateOrganizationSettingDto', () => {
  it('should be defined', () => {
    expect(CreateOrganizationSettingDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateOrganizationSettingDto();
      expect(dto).toBeInstanceOf(CreateOrganizationSettingDto);
    });

    it('accepts a supported default locale', async () => {
      expect(await defaultLocaleErrorsFor('en')).toEqual([]);
    });

    it('accepts an omitted default locale', async () => {
      expect(await defaultLocaleErrorsFor(undefined)).toEqual([]);
    });

    it('rejects a default locale outside the allowlist', async () => {
      const defaultLocaleErrors = await defaultLocaleErrorsFor('fr');

      expect(defaultLocaleErrors).toHaveLength(1);
      expect(defaultLocaleErrors[0]?.constraints).toHaveProperty('isIn');
    });
  });
});
