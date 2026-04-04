import { CreateOrganizationDto } from '@api/collections/organizations/dto/create-organization.dto';

describe('CreateOrganizationDto', () => {
  it('should be defined', () => {
    expect(CreateOrganizationDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateOrganizationDto();
      expect(dto).toBeInstanceOf(CreateOrganizationDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateOrganizationDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
