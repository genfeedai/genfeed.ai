import { UpdateSubscriptionDto } from './update-subscription.dto';

describe('UpdateSubscriptionDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateSubscriptionDto();
      expect(dto).toBeInstanceOf(UpdateSubscriptionDto);
    });
  });
});
