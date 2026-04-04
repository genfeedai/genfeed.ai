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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateOrganizationSettingDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
