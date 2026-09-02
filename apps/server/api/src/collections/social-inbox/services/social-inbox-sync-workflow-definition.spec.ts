import { Platform, SocialConversationType } from '@genfeedai/contracts';
import {
  buildSocialInboxSyncWorkflowDefinition,
  SOCIAL_INBOX_SYNC_ACTION_IDS,
} from './social-inbox-sync-workflow-definition';

describe('buildSocialInboxSyncWorkflowDefinition', () => {
  it.each([
    [
      Platform.YOUTUBE,
      SocialConversationType.COMMENT,
      SOCIAL_INBOX_SYNC_ACTION_IDS.YOUTUBE_COMMENTS,
    ],
    [
      Platform.INSTAGRAM,
      SocialConversationType.DM,
      SOCIAL_INBOX_SYNC_ACTION_IDS.INSTAGRAM_DMS,
    ],
    [
      Platform.TWITTER,
      SocialConversationType.COMMENT,
      SOCIAL_INBOX_SYNC_ACTION_IDS.X_COMMENTS,
    ],
    [
      Platform.LINKEDIN,
      SocialConversationType.DM,
      SOCIAL_INBOX_SYNC_ACTION_IDS.LINKEDIN_DMS,
    ],
  ] as const)(
    'binds %s/%s to its explicit ingestion action',
    (platform, conversationType, actionId) => {
      const definition = buildSocialInboxSyncWorkflowDefinition(
        platform,
        conversationType,
      );

      expect(
        definition.definition.nodes.map((node) => node.data.config.actionId),
      ).toEqual([SOCIAL_INBOX_SYNC_ACTION_IDS.VALIDATE, actionId]);
    },
  );
});
