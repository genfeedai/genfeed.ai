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
  });
});
