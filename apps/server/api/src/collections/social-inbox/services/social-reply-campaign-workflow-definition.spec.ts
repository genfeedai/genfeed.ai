import { describe, expect, it } from 'vitest';
import { SOCIAL_INBOX_OUTBOUND_ACTION_IDS } from './social-inbox-outbound-workflow-definition';
import {
  buildSocialReplyCampaignWorkflowDefinition,
  SOCIAL_REPLY_CAMPAIGN_ACTION_IDS,
} from './social-reply-campaign-workflow-definition';

describe('buildSocialReplyCampaignWorkflowDefinition', () => {
  it('makes every dispatch state transition an explicit action node', () => {
    const definition = buildSocialReplyCampaignWorkflowDefinition();
    expect(
      definition.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([
      SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.LOAD,
      SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.RECLAIM,
      SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.THROTTLE,
      SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.CLAIM,
      SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.PREPARE,
      SOCIAL_INBOX_OUTBOUND_ACTION_IDS.RESERVE,
      SOCIAL_INBOX_OUTBOUND_ACTION_IDS.PROVIDER,
      SOCIAL_INBOX_OUTBOUND_ACTION_IDS.FINALIZE,
      SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.FINALIZE,
    ]);
    expect(definition.definition.edges).toHaveLength(8);
    expect(definition.resultNodeId).toBe('finalize-tick');
  });
});
