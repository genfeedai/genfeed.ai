import { UpdateSubscriptionDto } from './update-subscription.dto';

describe('UpdateSubscriptionDto', () => {
  it('should be defined', () => {
    expect(UpdateSubscriptionDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateSubscriptionDto();
      expect(dto).toBeInstanceOf(UpdateSubscriptionDto);
    });
  });
});
