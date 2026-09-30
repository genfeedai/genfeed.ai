import { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('UpdateOrganizationSettingDto', () => {
  it('should be defined', () => {
    expect(UpdateOrganizationSettingDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateOrganizationSettingDto();
      expect(dto).toBeInstanceOf(UpdateOrganizationSettingDto);
    });

    it('accepts a partial update of only the daily publishing caps', async () => {
      const dto = plainToInstance(UpdateOrganizationSettingDto, {
        quotaInstagram: 0,
        quotaTiktok: 3,
        quotaTwitter: 48,
        quotaYoutube: 10,
      });

      expect(await validate(dto)).toEqual([]);
      expect(dto.quotaTwitter).toBe(48);
    });

    it('rejects an out-of-range daily publishing cap', async () => {
      const dto = plainToInstance(UpdateOrganizationSettingDto, {
        quotaTwitter: 5000,
      });
      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toEqual(['quotaTwitter']);
      expect(errors[0]?.constraints).toHaveProperty('max');
    });

    it('keeps the daily publishing caps after whitelist validation', async () => {
      const dto = plainToInstance(UpdateOrganizationSettingDto, {
        quotaTwitter: 48,
      });

      expect(await validate(dto, { whitelist: true })).toEqual([]);
      expect(dto.quotaTwitter).toBe(48);
    });
  });
});
