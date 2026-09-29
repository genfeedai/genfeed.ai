import { CampaignStatus, CampaignType } from '@genfeedai/contracts';
import { buildOutreachCampaignFacts } from '@pages/agents/campaigns/outreach-campaign-detail-facts.helper';
import type { OutreachCampaign } from '@services/automation/outreach-campaigns.service';
import { describe, expect, it } from 'vitest';

function buildCampaign(
  overrides: Partial<OutreachCampaign> = {},
): OutreachCampaign {
  return {
    campaignType: CampaignType.DM_OUTREACH,
    credentialId: 'credential-1',
    id: 'campaign-1',
    isActive: true,
    label: 'Spring Sequence',
    organizationId: 'org-1',
    status: CampaignStatus.ACTIVE,
    totalDmsSent: 0,
    totalFailed: 0,
    totalReplies: 0,
    totalSkipped: 0,
    totalSuccessful: 0,
    totalTargets: 0,
    ...overrides,
  } as OutreachCampaign;
}

describe('buildOutreachCampaignFacts', () => {
  it('uses the caller-provided platform and status labels', () => {
    const facts = buildOutreachCampaignFacts(buildCampaign(), 'X', 'Active');
    const byId = new Map(facts.map((fact) => [fact.id, fact.value]));

    expect(byId.get('platform')).toBe('X');
    expect(byId.get('status')).toBe('Active');
    expect(byId.get('type')).toBe(CampaignType.DM_OUTREACH);
  });
});
