import { OssUserSubscriptionsService } from '@api/common/subscriptions/oss-user-subscriptions.service';
import { ForbiddenException } from '@nestjs/common';

describe('OssUserSubscriptionsService', () => {
  let service: OssUserSubscriptionsService;

  beforeEach(() => {
    service = new OssUserSubscriptionsService();
  });

  it('returns no per-user subscription on read paths', async () => {
    await expect(service.findByUser('user-1')).resolves.toBeNull();
  });

  it('never throws on the always-on checkout-session webhook path', async () => {
    await expect(
      service.updateFromStripeSession('user-1', { subscription: 'sub_1' }),
    ).resolves.toBeNull();
  });

  it('throws ForbiddenException on user-initiated provisioning', async () => {
    await expect(
      service.getOrCreateSubscription('user-1', 'cus_123'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
