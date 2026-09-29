import { SubscriptionEntity } from './subscription.entity';

describe('SubscriptionEntity', () => {
  it('should create an instance', () => {
    const entity = new SubscriptionEntity({});
    expect(entity).toBeInstanceOf(SubscriptionEntity);
  });
});
