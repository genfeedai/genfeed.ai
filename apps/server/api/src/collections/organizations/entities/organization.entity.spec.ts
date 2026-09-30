import { OrganizationEntity } from '@api/collections/organizations/entities/organization.entity';

describe('OrganizationEntity', () => {
  it('should be defined', () => {
    expect(OrganizationEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new OrganizationEntity();
    expect(entity).toBeInstanceOf(OrganizationEntity);
  });
});
