import { CreateSubscriptionDto } from '@api/collections/subscriptions/dto/create-subscription.dto';

describe('CreateSubscriptionDto', () => {
  it('should be defined', () => {
    expect(CreateSubscriptionDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateSubscriptionDto();
      expect(dto).toBeInstanceOf(CreateSubscriptionDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateSubscriptionDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
