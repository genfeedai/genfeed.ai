import {
  buildApplySuggestionWorkflowDefinition,
  buildContentAnalysisWorkflowDefinition,
  buildPromptOptimizationWorkflowDefinition,
  CONTENT_OPTIMIZATION_ACTION_IDS,
} from '@api/services/content-optimization/content-optimization-workflow-definition';

describe('content optimization workflow definitions', () => {
  it('separates evidence loading, cycle execution, and analysis derivation', () => {
    const definition = buildContentAnalysisWorkflowDefinition();
    const actionIds = definition.definition.nodes.map(
      (node) => node.data.config.actionId,
    );

    expect(actionIds).toEqual([
      CONTENT_OPTIMIZATION_ACTION_IDS.LOAD_SUMMARY,
      CONTENT_OPTIMIZATION_ACTION_IDS.RUN_CYCLE,
      CONTENT_OPTIMIZATION_ACTION_IDS.DERIVE_ANALYSIS,
    ]);
  });

  it('separates performance context loading from prompt optimization', () => {
    const definition = buildPromptOptimizationWorkflowDefinition();

    expect(
      definition.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([
      CONTENT_OPTIMIZATION_ACTION_IDS.LOAD_PROMPT_CONTEXT,
      CONTENT_OPTIMIZATION_ACTION_IDS.OPTIMIZE_PROMPT,
    ]);
  });

  it('regenerates current suggestions before applying one', () => {
    const definition = buildApplySuggestionWorkflowDefinition();

    expect(definition.definition.edges).toContainEqual(
      expect.objectContaining({
        source: 'generate-suggestions',
        target: 'apply-suggestion',
      }),
    );
  });
});
