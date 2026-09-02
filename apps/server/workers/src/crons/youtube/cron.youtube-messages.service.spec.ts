import { SOCIAL_INBOX_SYNC_WORKFLOW_IDS } from '@api/collections/social-inbox/services/social-inbox-sync-workflow-definition';
import { buildYoutubeCommentsSweepDefinition } from '@workers/crons/youtube/youtube-maintenance-workflow-definition';

describe('YouTube comment workflows', () => {
  it('fans connected credentials into comment ingestion workflows', () => {
    expect(
      buildYoutubeCommentsSweepDefinition().definition.nodes[1]?.data.config
        .actionId,
    ).toBe('workflow.for-each-tenant');
    expect(
      buildYoutubeCommentsSweepDefinition().definition.nodes[1]?.data.config
        .childWorkflowId,
    ).toBe(SOCIAL_INBOX_SYNC_WORKFLOW_IDS.YOUTUBE_COMMENTS);
  });
});
