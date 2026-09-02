import {
  AI_INFLUENCER_ACTION_IDS,
  AI_INFLUENCER_WORKFLOW_IDS,
  buildAiInfluencerDailyPostsWorkflowDefinition,
  buildAiInfluencerGeneratePostWorkflowDefinition,
} from '@api/services/ai-influencer/ai-influencer-workflow-definition';

describe('AI influencer workflow definitions', () => {
  it('expresses media generation and publishing as action nodes and fan-out', () => {
    const definition = buildAiInfluencerGeneratePostWorkflowDefinition();
    const actionIds = definition.definition.nodes.map(
      (node) => node.data.config.actionId,
    );

    expect(actionIds).toEqual([
      AI_INFLUENCER_ACTION_IDS.PERSONA_LOAD,
      AI_INFLUENCER_ACTION_IDS.CAPTION_GENERATE,
      AI_INFLUENCER_ACTION_IDS.IMAGE_PREPARE,
      AI_INFLUENCER_ACTION_IDS.IMAGE_GENERATE,
      AI_INFLUENCER_ACTION_IDS.INGREDIENT_CREATE,
      AI_INFLUENCER_ACTION_IDS.VIDEO_PLAN,
      'workflow.for-each',
      'workflow.for-each',
      AI_INFLUENCER_ACTION_IDS.PUBLISH_PLAN,
      'workflow.for-each',
      AI_INFLUENCER_ACTION_IDS.POST_FINALIZE,
    ]);
    expect(
      definition.definition.nodes.find(
        (node) => node.id === 'publish-platforms',
      )?.data.config.parameters,
    ).toMatchObject({
      childWorkflowId: AI_INFLUENCER_WORKFLOW_IDS.PUBLISH_PLATFORM,
      mode: 'await',
    });
  });

  it('discovers personas and fans each into the daily child workflow', () => {
    const definition = buildAiInfluencerDailyPostsWorkflowDefinition();

    expect(definition.definition.inputVariables).toEqual([]);
    expect(
      definition.definition.nodes[1]?.data.config.parameters,
    ).toMatchObject({
      childWorkflowId: AI_INFLUENCER_WORKFLOW_IDS.DAILY_POST,
      mode: 'await',
    });
  });
});
