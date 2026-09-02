import {
  AUTOMATION_ACTION_IDS,
  AUTOMATION_CHILD_WORKFLOWS,
  AUTOMATION_PARENT_WORKFLOWS,
  AUTOMATION_WORKFLOW_IDS,
  buildAgentProactiveWorkflowDefinition,
  buildContentEngineWorkflowDefinition,
  buildHarnessWinnerWorkflowDefinition,
  buildLivestreamSessionWorkflowDefinition,
  buildPaidCreativeResearchWorkflowDefinition,
  buildReplyBotPollingWorkflowDefinition,
  buildSocialTriggerPollingWorkflowDefinition,
  buildTrendNotificationWorkflowDefinition,
} from '@api/collections/workflows/services/automation-workflow-definitions';
import { getActionDefinition } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';

function actionIds(
  definition: ReturnType<typeof buildAgentProactiveWorkflowDefinition>,
): string[] {
  return definition.definition.nodes.map((node) =>
    String(node.data.config.actionId),
  );
}

describe('automation workflow definitions', () => {
  it('registers one immutable definition for every parent and child identity', () => {
    const definitions = [
      ...AUTOMATION_PARENT_WORKFLOWS,
      ...AUTOMATION_CHILD_WORKFLOWS,
    ];
    const canonicalIds = definitions.map(
      (definition) => definition.canonicalId,
    );

    expect(new Set(canonicalIds).size).toBe(canonicalIds.length);
    expect(canonicalIds).toEqual(
      expect.arrayContaining(Object.values(AUTOMATION_WORKFLOW_IDS)),
    );
    expect(
      definitions.every((definition) => definition.resultNodeId.length > 0),
    ).toBe(true);
  });

  it.each([
    [
      buildAgentProactiveWorkflowDefinition(),
      AUTOMATION_WORKFLOW_IDS.AGENT_STRATEGY,
    ],
    [
      buildContentEngineWorkflowDefinition(),
      AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE_BRAND,
    ],
    [
      buildReplyBotPollingWorkflowDefinition(),
      AUTOMATION_WORKFLOW_IDS.REPLY_BOT_TARGET,
    ],
    [
      buildSocialTriggerPollingWorkflowDefinition(),
      AUTOMATION_WORKFLOW_IDS.SOCIAL_TRIGGER_WORKFLOW,
    ],
    [
      buildLivestreamSessionWorkflowDefinition(),
      AUTOMATION_WORKFLOW_IDS.LIVESTREAM_SESSION,
    ],
    [
      buildHarnessWinnerWorkflowDefinition(),
      AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS_BRAND,
    ],
    [
      buildPaidCreativeResearchWorkflowDefinition(),
      AUTOMATION_WORKFLOW_IDS.PAID_CREATIVE_ADVERTISER,
    ],
  ])(
    'uses registered await-mode fan-out in %s',
    (definition, childWorkflowId) => {
      // A parent may fan out over more than one child (agent autopilot resets
      // credit windows before dispatching strategies), so match the fan-out by
      // the child identity under test instead of taking the first node.
      const fanOut = definition.definition.nodes.find(
        (node) =>
          node.data.config.actionId === 'workflow.for-each' &&
          (node.data.config.parameters as { childWorkflowId?: string })
            ?.childWorkflowId === childWorkflowId,
      );
      expect(fanOut?.data.config.parameters).toMatchObject({
        childWorkflowId,
        maxConcurrency: 1,
        mode: 'await',
      });
    },
  );

  it('decomposes trend delivery into three independent channel actions', () => {
    expect(
      actionIds(buildTrendNotificationWorkflowDefinition('daily')),
    ).toEqual([
      AUTOMATION_ACTION_IDS.TRENDS_PREPARE,
      AUTOMATION_ACTION_IDS.TRENDS_READ_VIDEOS,
      AUTOMATION_ACTION_IDS.TRENDS_READ_HASHTAGS,
      AUTOMATION_ACTION_IDS.TRENDS_READ_SOUNDS,
      AUTOMATION_ACTION_IDS.TRENDS_RENDER,
      AUTOMATION_ACTION_IDS.TRENDS_DELIVER_TELEGRAM,
      AUTOMATION_ACTION_IDS.TRENDS_DELIVER_EMAIL,
      AUTOMATION_ACTION_IDS.TRENDS_DELIVER_IN_APP,
      AUTOMATION_ACTION_IDS.TRENDS_FINALIZE,
    ]);
  });

  it('decomposes every nested iteration into registered child workflows', () => {
    const definitions = [
      ...AUTOMATION_PARENT_WORKFLOWS,
      ...AUTOMATION_CHILD_WORKFLOWS,
    ];
    const childWorkflowIds = definitions.flatMap((definition) =>
      definition.definition.nodes.flatMap((node) => {
        if (node.data.config.actionId !== 'workflow.for-each') return [];
        const { parameters } = node.data.config;
        const childWorkflowId =
          parameters &&
          typeof parameters === 'object' &&
          'childWorkflowId' in parameters
            ? parameters.childWorkflowId
            : undefined;
        return typeof childWorkflowId === 'string' ? [childWorkflowId] : [];
      }),
    );

    expect(childWorkflowIds).toEqual(
      expect.arrayContaining([
        AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE_ITEM,
        AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE_IMAGE,
        AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE_MUSIC,
        AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE_VIDEO,
        AUTOMATION_WORKFLOW_IDS.LIVESTREAM_TARGET,
        AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS_ITEM,
        AUTOMATION_WORKFLOW_IDS.SOCIAL_TRIGGER_WORKFLOW,
      ]),
    );
    expect(
      childWorkflowIds.every((childWorkflowId) =>
        definitions.some(
          (definition) => definition.canonicalId === childWorkflowId,
        ),
      ),
    ).toBe(true);
  });

  it('backs every automation node with a registered action contract', () => {
    const actionIds = [
      ...AUTOMATION_PARENT_WORKFLOWS,
      ...AUTOMATION_CHILD_WORKFLOWS,
    ].flatMap((definition) =>
      definition.definition.nodes.map((node) =>
        String(node.data.config.actionId),
      ),
    );

    expect(actionIds.every((actionId) => getActionDefinition(actionId))).toBe(
      true,
    );
  });

  it('contains none of the retired macro action IDs', () => {
    const serialized = JSON.stringify([
      ...AUTOMATION_PARENT_WORKFLOWS,
      ...AUTOMATION_CHILD_WORKFLOWS,
    ]);
    for (const retiredId of [
      'proactiveAgentStrategies',
      'contentEngineProduction',
      'contentPipelineAutopilot',
      'replyBotPolling',
      'socialTriggerPolling',
      'trendSummaryNotifications',
      'livestreamBotSessionProcessing',
      'restreamChatIngest',
      'harnessWinnerPromotionSweep',
      'paidCreativeResearchIngestion',
    ]) {
      expect(serialized).not.toContain(retiredId);
    }
  });
});
