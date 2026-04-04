import { CustomerEntity } from '@api/collections/customers/entities/customer.entity';

describe('CustomerEntity', () => {
  it('should be defined', () => {
    expect(CustomerEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new CustomerEntity();
    expect(entity).toBeInstanceOf(CustomerEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new CustomerEntity();
  //     // Test properties
  //   });
  // });
});
