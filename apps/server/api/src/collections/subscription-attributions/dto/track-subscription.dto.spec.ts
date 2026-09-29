import { TrackSubscriptionDto } from './track-subscription.dto';

describe('TrackSubscriptionDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new TrackSubscriptionDto();
      expect(dto).toBeInstanceOf(TrackSubscriptionDto);
    });
  });
});
