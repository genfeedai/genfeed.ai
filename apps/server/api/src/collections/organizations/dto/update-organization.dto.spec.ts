import { UpdateOrganizationDto } from '@api/collections/organizations/dto/update-organization.dto';

describe('UpdateOrganizationDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateOrganizationDto();
      expect(dto).toBeInstanceOf(UpdateOrganizationDto);
    });
  });
});
