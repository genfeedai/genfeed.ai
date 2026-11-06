import { OssSubscriptionsService } from '@api/common/subscriptions/oss-subscriptions.service';
import type { ISubscriptionOssReadModel } from '@genfeedai/contracts/interfaces/billing';
import { ForbiddenException } from '@nestjs/common';

function createSubscription(): ISubscriptionOssReadModel {
  return {
    cancelAtPeriodEnd: false,
    id: 'sub_1',
    isDeleted: false,
    organizationId: 'org-1',
    status: 'active',
    userId: 'user-1',
  };
}

describe('OssSubscriptionsService', () => {
  let service: OssSubscriptionsService;

  beforeEach(() => {
    service = new OssSubscriptionsService();
  });

  it('returns no active subscription record by default', async () => {
    await expect(
      service.findOne({ isDeleted: false, organizationId: 'org-1' }),
    ).resolves.toBeNull();
    await expect(service.findByOrganizationId('org-1')).resolves.toBeNull();
    await expect(service.findByStripeCustomerId('cus_123')).resolves.toBeNull();
  });

  it('returns an empty page for OSS analytics callers', async () => {
    await expect(
      service.findAll(
        { where: { organizationId: 'org-1' } },
        {
          limit: 1,
          page: 1,
          pagination: false,
        },
        false,
      ),
    ).resolves.toEqual({ docs: [], total: 0, totalDocs: 0 });
  });

  it('never throws on always-on webhook paths', async () => {
    // The Stripe webhook fires these continuously; a throw would 500 it on a
    // self-hosted install that never provisioned managed billing.
    await expect(
      service.patch('sub_1', { status: 'active' }),
    ).resolves.toBeNull();
    await expect(
      service.syncSubscriptionState(createSubscription()),
    ).resolves.toBeUndefined();
  });

  it('echoes the argument from syncWithStripe so callers can chain safely', async () => {
    const subscription = createSubscription();
    await expect(service.syncWithStripe(subscription)).resolves.toBe(
      subscription,
    );
  });

  it('throws ForbiddenException on user-initiated provisioning', async () => {
    await expect(
      service.createForOrganization({}, 'billing@example.com', 'user-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.createForOrganization({}, 'billing@example.com', 'user-1'),
    ).rejects.toThrow(/not enabled on this deployment/);
  });
});
