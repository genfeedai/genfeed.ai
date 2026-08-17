import { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';

describe('UpdateOrganizationSettingDto', () => {
  it('should be defined', () => {
    expect(UpdateOrganizationSettingDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateOrganizationSettingDto();
      expect(dto).toBeInstanceOf(UpdateOrganizationSettingDto);
    });
  });
});
