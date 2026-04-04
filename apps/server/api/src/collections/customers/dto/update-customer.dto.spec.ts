import { UpdateCustomerDto } from '@api/collections/customers/dto/update-customer.dto';

describe('UpdateCustomerDto', () => {
  it('should be defined', () => {
    expect(UpdateCustomerDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateCustomerDto();
      expect(dto).toBeInstanceOf(UpdateCustomerDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateCustomerDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
