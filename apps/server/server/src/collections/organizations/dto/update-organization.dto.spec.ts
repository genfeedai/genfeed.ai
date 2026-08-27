import { UpdateOrganizationDto } from '@server/collections/organizations/dto/update-organization.dto';

describe('UpdateOrganizationDto', () => {
  it('should be defined', () => {
    expect(UpdateOrganizationDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateOrganizationDto();
      expect(dto).toBeInstanceOf(UpdateOrganizationDto);
    });
  });
});
