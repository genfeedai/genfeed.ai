import { OrganizationQueryDto } from '@api/collections/organizations/dto/organization-query.dto';

describe('OrganizationQueryDto', () => {
  it('should be defined', () => {
    expect(OrganizationQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new OrganizationQueryDto();
      expect(dto).toBeInstanceOf(OrganizationQueryDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new OrganizationQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
