import { CreateOrganizationSettingDto } from '@api/collections/organization-settings/dto/create-organization-setting.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function defaultLocaleErrorsFor(defaultLocale: unknown) {
  const dto = plainToInstance(CreateOrganizationSettingDto, { defaultLocale });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'defaultLocale');
}

const QUOTA_FIELDS = [
  'quotaYoutube',
  'quotaTiktok',
  'quotaTwitter',
  'quotaInstagram',
] as const;

async function quotaErrorsFor(
  field: (typeof QUOTA_FIELDS)[number],
  value: unknown,
) {
  const dto = plainToInstance(CreateOrganizationSettingDto, { [field]: value });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === field);
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

    describe.each(QUOTA_FIELDS)('%s daily publishing cap', (field) => {
      it.each([0, 1, 48, 1000])('accepts %s', async (value) => {
        expect(await quotaErrorsFor(field, value)).toEqual([]);
      });

      it('accepts an omitted value', async () => {
        expect(await quotaErrorsFor(field, undefined)).toEqual([]);
      });

      it('rejects a negative value', async () => {
        const errors = await quotaErrorsFor(field, -1);

        expect(errors).toHaveLength(1);
        expect(errors[0]?.constraints).toHaveProperty('min');
      });

      it('rejects a value above 1000', async () => {
        const errors = await quotaErrorsFor(field, 1001);

        expect(errors).toHaveLength(1);
        expect(errors[0]?.constraints).toHaveProperty('max');
      });

      it('rejects a non-integer value', async () => {
        const errors = await quotaErrorsFor(field, 2.5);

        expect(errors).toHaveLength(1);
        expect(errors[0]?.constraints).toHaveProperty('isInt');
      });

      it('rejects a numeric string', async () => {
        const errors = await quotaErrorsFor(field, '48');

        expect(errors).toHaveLength(1);
        expect(errors[0]?.constraints).toHaveProperty('isInt');
      });
    });
  });
});
