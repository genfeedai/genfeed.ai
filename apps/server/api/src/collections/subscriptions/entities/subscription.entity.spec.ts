import { SubscriptionEntity } from './subscription.entity';

describe('SubscriptionEntity', () => {
  it('should be defined', () => {
    expect(SubscriptionEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new SubscriptionEntity();
    expect(entity).toBeInstanceOf(SubscriptionEntity);
  });
});
