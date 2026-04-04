import { SubscriptionEntity } from '@api/collections/subscriptions/entities/subscription.entity';

describe('SubscriptionEntity', () => {
  it('should be defined', () => {
    expect(SubscriptionEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new SubscriptionEntity();
    expect(entity).toBeInstanceOf(SubscriptionEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new SubscriptionEntity();
  //     // Test properties
  //   });
  // });
});
