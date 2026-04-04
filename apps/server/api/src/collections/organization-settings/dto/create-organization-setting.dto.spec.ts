import { CreateOrganizationSettingDto } from '@api/collections/organization-settings/dto/create-organization-setting.dto';

describe('CreateOrganizationSettingDto', () => {
  it('should be defined', () => {
    expect(CreateOrganizationSettingDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateOrganizationSettingDto();
      expect(dto).toBeInstanceOf(CreateOrganizationSettingDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateOrganizationSettingDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
