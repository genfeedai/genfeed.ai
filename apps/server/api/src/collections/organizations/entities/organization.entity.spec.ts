import { OrganizationEntity } from '@api/collections/organizations/entities/organization.entity';

describe('OrganizationEntity', () => {
  it('should create an instance', () => {
    const entity = new OrganizationEntity();
    expect(entity).toBeInstanceOf(OrganizationEntity);
  });
});
