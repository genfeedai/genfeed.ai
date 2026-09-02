import {
  buildSocialInboxOutboundWorkflowDefinition,
  SOCIAL_INBOX_OUTBOUND_ACTION_IDS,
  SOCIAL_INBOX_OUTBOUND_WORKFLOW_IDS,
} from './social-inbox-outbound-workflow-definition';

describe('social inbox outbound workflow definition', () => {
  it.each([
    ['reply', SOCIAL_INBOX_OUTBOUND_WORKFLOW_IDS.POST_REPLY],
    ['dm', SOCIAL_INBOX_OUTBOUND_WORKFLOW_IDS.SEND_DM],
  ] as const)(
    'composes %s through the same atomic actions',
    (messageType, id) => {
      const definition =
        buildSocialInboxOutboundWorkflowDefinition(messageType);

      expect(definition.canonicalId).toBe(id);
      expect(
        definition.definition.nodes.map((node) => node.data.config.actionId),
      ).toEqual([
        SOCIAL_INBOX_OUTBOUND_ACTION_IDS.RESERVE,
        SOCIAL_INBOX_OUTBOUND_ACTION_IDS.PROVIDER,
        SOCIAL_INBOX_OUTBOUND_ACTION_IDS.FINALIZE,
      ]);
    },
  );
});
