import { UpdateOrganizationDto } from '@api/collections/organizations/dto/update-organization.dto';

describe('UpdateOrganizationDto', () => {
  it('should be defined', () => {
    expect(UpdateOrganizationDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateOrganizationDto();
      expect(dto).toBeInstanceOf(UpdateOrganizationDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateOrganizationDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
