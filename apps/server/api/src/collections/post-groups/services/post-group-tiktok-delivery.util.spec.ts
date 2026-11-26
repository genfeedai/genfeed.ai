import { tikTokDeliverySettings } from '@api/collections/post-groups/services/post-group-tiktok-delivery.util';

describe('tikTokDeliverySettings', () => {
  it('records the TikTok app delivery next to the other settings', () => {
    expect(
      tikTokDeliverySettings({ privacyLevel: 'private' }, 'tiktok_app'),
    ).toEqual({ deliveryMode: 'tiktok_app', privacyLevel: 'private' });
  });

  it('clears a recorded delivery when the creator publishes directly', () => {
    expect(
      tikTokDeliverySettings(
        { deliveryMode: 'tiktok_app', privacyLevel: 'private' },
        'publish_now',
      ),
    ).toEqual({ privacyLevel: 'private' });
  });

  it('leaves settings without a delivery as they were', () => {
    expect(tikTokDeliverySettings({ allowDuet: true }, 'publish_now')).toEqual({
      allowDuet: true,
    });
  });
});
