import { UpdateCustomerDto } from '@api/collections/customers/dto/update-customer.dto';

describe('UpdateCustomerDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateCustomerDto();
      expect(dto).toBeInstanceOf(UpdateCustomerDto);
    });
  });
});
