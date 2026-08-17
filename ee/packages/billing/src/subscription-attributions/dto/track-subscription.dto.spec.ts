import { TrackSubscriptionDto } from './track-subscription.dto';

describe('TrackSubscriptionDto', () => {
  it('should be defined', () => {
    expect(TrackSubscriptionDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new TrackSubscriptionDto();
      expect(dto).toBeInstanceOf(TrackSubscriptionDto);
    });
  });
});
