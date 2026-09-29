import { OrganizationQueryDto } from '@api/collections/organizations/dto/organization-query.dto';

describe('OrganizationQueryDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new OrganizationQueryDto();
      expect(dto).toBeInstanceOf(OrganizationQueryDto);
    });
  });
});
