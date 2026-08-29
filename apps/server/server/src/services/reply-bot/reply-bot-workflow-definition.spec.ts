import {
  buildReplyBotContentWorkflowDefinition,
  buildReplyBotDmWorkflowDefinition,
  buildReplyBotOrganizationWorkflowDefinition,
  buildReplyBotWorkflowDefinition,
  REPLY_BOT_ACTION_IDS,
  REPLY_BOT_WORKFLOW_IDS,
} from './reply-bot-workflow-definition';

describe('reply bot system workflow definitions', () => {
  it('fans organizations into bot workflows and bots into content workflows', () => {
    const organization = buildReplyBotOrganizationWorkflowDefinition();
    const bot = buildReplyBotWorkflowDefinition();

    expect(organization.definition.nodes[1]?.data.config).toMatchObject({
      actionId: 'workflow.for-each',
      parameters: {
        childWorkflowId: REPLY_BOT_WORKFLOW_IDS.BOT,
        mode: 'await',
      },
    });
    expect(bot.definition.nodes[1]?.data.config).toMatchObject({
      actionId: 'workflow.for-each',
      parameters: {
        childWorkflowId: REPLY_BOT_WORKFLOW_IDS.CONTENT,
        mode: 'await',
      },
    });
  });

  it('uses a scheduled one-item child workflow for delayed DMs', () => {
    const content = buildReplyBotContentWorkflowDefinition();
    const schedule = content.definition.nodes.find(
      (node) => node.id === 'schedule-dm',
    );

    expect(schedule?.data.config).toMatchObject({
      actionId: 'workflow.for-each',
      parameters: {
        childWorkflowId: REPLY_BOT_WORKFLOW_IDS.DM,
        maxConcurrency: 1,
        mode: 'scheduled',
      },
    });
    expect(content.definition.edges).toContainEqual(
      expect.objectContaining({
        source: 'send-reply',
        sourceHandle: 'dmDelayMs',
        target: 'schedule-dm',
        targetHandle: 'initialDelayMs',
      }),
    );
  });

  it('makes the DM child own provider send and activity finalization', () => {
    const dm = buildReplyBotDmWorkflowDefinition();

    expect(
      dm.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([REPLY_BOT_ACTION_IDS.SEND_DM, REPLY_BOT_ACTION_IDS.FINALIZE_DM]);
  });
});
