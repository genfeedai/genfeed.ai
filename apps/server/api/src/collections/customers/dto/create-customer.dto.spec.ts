import { CreateCustomerDto } from '@api/collections/customers/dto/create-customer.dto';

describe('CreateCustomerDto', () => {
  it('should be defined', () => {
    expect(CreateCustomerDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateCustomerDto();
      expect(dto).toBeInstanceOf(CreateCustomerDto);
    });
  });
});
