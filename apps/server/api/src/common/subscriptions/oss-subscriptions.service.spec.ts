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
  });

  it('keeps the aggregation contract stable for OSS analytics callers', async () => {
    await expect(
      service.findAll([{ $count: 'total' }], {
        limit: 1,
        page: 1,
        pagination: false,
      }),
    ).resolves.toEqual({ total: 0 });
  });

  it('exposes controlled stubs for enterprise-only subscription actions', async () => {
    await expect(
      service.changeSubscriptionPlan('org-1', 'price_123'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.previewSubscriptionChange('org-1', 'price_123'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.createForOrganization({}, 'billing@example.com', 'user-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.syncSubscriptionToClerkMetadata({ user: 'user-1' }),
    ).resolves.toBeUndefined();
  });
});
