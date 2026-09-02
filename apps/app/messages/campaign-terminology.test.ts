import { describe, expect, it } from 'vitest';
import agent from './en/agent.json';
import common from './en/common.json';
import pages from './en/pages.json';

const CAMPAIGN_WORD = /\bcampaigns?\b/i;

function collectLeaves(
  value: unknown,
  path: string,
): Array<{ path: string; value: string }> {
  if (typeof value === 'string') {
    return [{ path, value }];
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectLeaves(child, path ? `${path}.${key}` : key),
  );
}

describe('Campaign terminology catalogs', () => {
  it('keeps Campaign out of Program, outreach sequence, and reply drip copy', () => {
    const forbidden = [
      ...collectLeaves(common.agentCampaign, 'common.agentCampaign'),
      ...collectLeaves(common.outreachCampaign, 'common.outreachCampaign'),
      ...collectLeaves(pages.outreachCampaign, 'pages.outreachCampaign'),
      ...collectLeaves(pages.replyDrip, 'pages.replyDrip'),
      ...collectLeaves(agent.outreachSequence, 'agent.outreachSequence'),
      ...collectLeaves(agent.tools, 'agent.tools'),
    ].filter((entry) => CAMPAIGN_WORD.test(entry.value));

    expect(forbidden).toEqual([]);
  });

  it('uses Program, outreach sequence, and reply drip as the reserved words', () => {
    expect(common.agentCampaign.campaignLabel).toBe('Program Label *');
    expect(pages.outreachCampaign.createTitle).toBe('Create outreach sequence');
    expect(pages.outreachCampaign.reviewTitle).toBe(
      'Review your outreach sequence',
    );
    expect(common.outreachCampaign.campaignName).toBe('Sequence name');
    expect(pages.replyDrip.title).toBe('Reply drip');
    expect(agent.tools.createOutreachSequence).toBe('Create outreach sequence');
  });

  it('retains explicit provider Ads campaign wording', () => {
    expect(pages.adsResearch.connection.title).toMatch(/campaigns/i);
    expect(pages.adsResearch.connection.description).toMatch(/campaigns/i);
    expect(pages.adsResearch.reviewPolicy).toMatch(/campaign/i);
    expect(pages.studioGenerate.remixRun.paidDraftSummary).toMatch(/Campaign/);
  });
});
