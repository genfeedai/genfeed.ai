import { UpdateSubscriptionDto } from '@api/collections/subscriptions/dto/update-subscription.dto';

describe('UpdateSubscriptionDto', () => {
  it('should be defined', () => {
    expect(UpdateSubscriptionDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateSubscriptionDto();
      expect(dto).toBeInstanceOf(UpdateSubscriptionDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateSubscriptionDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
