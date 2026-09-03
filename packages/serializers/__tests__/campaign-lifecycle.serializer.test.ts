import {
  ContentCampaignItemKind,
  ContentCampaignItemOutcomeStatus,
  ContentCampaignLifecycleAction,
  ContentCampaignStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { campaignLifecycleAttributes } from '@serializers/attributes/content/campaign-lifecycle.attributes';
import { CampaignLifecycleSerializer } from '@serializers/server/content/campaign-lifecycle.serializer';
import { describe, expect, it } from 'vitest';

describe('CampaignLifecycleSerializer', () => {
  it('serializes per-item outcomes beside the campaign program status', () => {
    const output = CampaignLifecycleSerializer.serialize({
      action: ContentCampaignLifecycleAction.START,
      campaign: {
        brandId: 'brand-1',
        id: 'campaign-1',
        name: 'Q4 launch',
        organizationId: 'org-1',
        status: ContentCampaignStatus.ACTIVE,
        userId: 'opaque-user',
      },
      id: 'campaign-1',
      items: [
        {
          executionState: TargetExecutionState.SCHEDULED,
          id: 'post-1',
          kind: ContentCampaignItemKind.POST,
          retryable: false,
          status: ContentCampaignItemOutcomeStatus.SUCCEEDED,
        },
        {
          id: 'post-2',
          kind: ContentCampaignItemKind.POST,
          reason: 'Review is not approved',
          retryable: true,
          status: ContentCampaignItemOutcomeStatus.INELIGIBLE,
        },
      ],
    }) as {
      data: {
        attributes: Record<string, unknown>;
        id: string;
        type: string;
      };
    };

    expect(campaignLifecycleAttributes).toEqual(
      expect.arrayContaining(['action', 'campaign', 'items']),
    );
    expect(output.data.id).toBe('campaign-1');
    expect(output.data.type).toBe('campaign-lifecycle');
    expect(output.data.attributes).toMatchObject({
      action: 'start',
      campaign: expect.objectContaining({
        id: 'campaign-1',
        status: 'active',
      }),
      items: [
        expect.objectContaining({
          id: 'post-1',
          status: 'succeeded',
        }),
        expect.objectContaining({
          id: 'post-2',
          retryable: true,
          status: 'ineligible',
        }),
      ],
    });
  });
});
