import { agentCampaignAttributes } from '@serializers/attributes/automation/agent-campaign.attributes';
import { AgentCampaignSerializer } from '@serializers/server/automation/agent-campaign.serializer';
import { describe, expect, it } from 'vitest';

describe('AgentCampaignSerializer brand scope contract', () => {
  it('emits the scalar brand id used to validate the selected brand', () => {
    const output = AgentCampaignSerializer.serialize({
      brandId: 'brand-1',
      id: 'campaign-1',
      label: 'Creator Studio Program',
      status: 'draft',
    }) as {
      data: {
        attributes: Record<string, unknown>;
        id: string;
        type: string;
      };
    };

    expect(agentCampaignAttributes).toContain('brandId');
    expect(output.data).toMatchObject({
      attributes: {
        brandId: 'brand-1',
      },
      id: 'campaign-1',
      type: 'agent-campaign',
    });
  });
});
