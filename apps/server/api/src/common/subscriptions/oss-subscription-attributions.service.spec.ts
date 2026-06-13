import { OssSubscriptionAttributionsService } from '@api/common/subscriptions/oss-subscription-attributions.service';

describe('OssSubscriptionAttributionsService', () => {
  let service: OssSubscriptionAttributionsService;

  beforeEach(() => {
    service = new OssSubscriptionAttributionsService();
  });

  it('never throws on the always-on attribution webhook path', async () => {
    await expect(
      service.trackSubscription(
        { plan: 'pro', stripeSubscriptionId: 'sub_1' },
        'org-1',
      ),
    ).resolves.toBeNull();
  });
});
