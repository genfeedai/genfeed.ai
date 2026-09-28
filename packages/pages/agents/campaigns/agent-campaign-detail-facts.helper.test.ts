import { buildAgentCampaignFacts } from '@pages/agents/campaigns/agent-campaign-detail-facts.helper';
import type { AgentCampaign } from '@services/automation/agent-campaigns.service';
import { describe, expect, it } from 'vitest';

function buildCampaign(overrides: Partial<AgentCampaign> = {}): AgentCampaign {
  return {
    agents: ['agent-1', 'agent-2'],
    brandId: 'brand-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    creditsAllocated: 1000,
    creditsUsed: 100,
    id: 'campaign-1',
    label: 'Spring Launch',
    organizationId: 'org-1',
    startDate: '2026-03-01T00:00:00.000Z',
    status: 'active',
    updatedAt: '2026-01-01T00:00:00.000Z',
    userId: 'user-1',
    ...overrides,
  } as AgentCampaign;
}

describe('buildAgentCampaignFacts', () => {
  it('uses the caller-provided status label and counts agents', () => {
    const facts = buildAgentCampaignFacts(buildCampaign(), 'Active');
    const byId = new Map(facts.map((fact) => [fact.id, fact.value]));

    expect(byId.get('status')).toBe('Active');
    expect(byId.get('agents')).toBe(2);
  });

  it('omits the end date and quota when the campaign has none', () => {
    const facts = buildAgentCampaignFacts(buildCampaign(), 'Active');
    const byId = new Map(facts.map((fact) => [fact.id, fact.value]));

    expect(byId.get('endDate')).toBeUndefined();
    expect(byId.get('quota')).toBeUndefined();
  });

  it('summarizes a content quota when the campaign has one', () => {
    const facts = buildAgentCampaignFacts(
      buildCampaign({
        contentQuota: { images: 2, posts: 5 },
        endDate: '2026-04-01T00:00:00.000Z',
      }),
      'Active',
    );
    const byId = new Map(facts.map((fact) => [fact.id, fact.value]));

    expect(byId.get('quota')).toBe('5 posts, 2 images');
    expect(byId.get('endDate')).toBeTruthy();
  });
});
