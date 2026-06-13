import { OssSubscriptionsService } from '@api/common/subscriptions/oss-subscriptions.service';
import { ForbiddenException } from '@nestjs/common';

describe('OssSubscriptionsService', () => {
  let service: OssSubscriptionsService;

  beforeEach(() => {
    service = new OssSubscriptionsService();
  });

  it('returns no active subscription record by default', async () => {
    await expect(
      service.findOne({ isDeleted: false, organization: 'org-1' }),
    ).resolves.toBeNull();
    await expect(service.findByOrganizationId('org-1')).resolves.toBeNull();
    await expect(service.findByStripeCustomerId('cus_123')).resolves.toBeNull();
  });

  it('keeps the aggregation contract stable for OSS analytics callers', async () => {
    await expect(
      service.findAll(
        [{ $count: 'total' }],
        {
          limit: 1,
          page: 1,
          pagination: false,
        },
        false,
      ),
    ).resolves.toEqual({ docs: [], total: 0 });
  });

  it('never throws on always-on webhook paths', async () => {
    // The Stripe webhook fires these continuously; a throw would 500 it on a
    // self-hosted install that never provisioned managed billing.
    await expect(
      service.patch('sub_1', { status: 'active' }),
    ).resolves.toBeNull();
    await expect(
      service.syncSubscriptionToClerkMetadata({ user: 'user-1' }),
    ).resolves.toBeUndefined();
  });

  it('echoes the argument from syncWithStripe so callers can chain safely', async () => {
    const subscription = { _id: 'sub_1', status: 'active' };
    await expect(service.syncWithStripe(subscription)).resolves.toBe(
      subscription,
    );
  });

  it('throws ForbiddenException on user-initiated provisioning', async () => {
    await expect(
      service.createForOrganization({}, 'billing@example.com', 'user-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
