import { ContentCampaignPaidActivationStatus } from '@genfeedai/contracts';
import { CampaignPaidActivationSerializer } from '@serializers/server/content/campaign-paid-activation.serializer';
import { describe, expect, it } from 'vitest';

describe('CampaignPaidActivationSerializer', () => {
  it('serializes paused provider lineage without a spend switch', () => {
    const output = CampaignPaidActivationSerializer.serialize({
      adAccountId: 'act-1',
      campaignId: 'campaign-1',
      credentialId: 'cred-1',
      externalAdId: 'ad-1',
      externalAdSetId: 'set-1',
      externalCampaignId: 'ext-1',
      id: 'activation-1',
      platform: 'meta',
      postIds: ['post-1'],
      spendApprovedAt: null,
      status: ContentCampaignPaidActivationStatus.PAUSED,
    }) as { data: { attributes: Record<string, unknown>; type: string } };

    expect(output.data.type).toBe('campaign-paid-activation');
    expect(output.data.attributes).toMatchObject({
      externalCampaignId: 'ext-1',
      status: 'paused',
    });
  });
});
