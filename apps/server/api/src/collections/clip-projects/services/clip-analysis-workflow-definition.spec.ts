import {
  buildClipAnalysisFailureWorkflowDefinition,
  buildClipAnalysisWorkflowDefinition,
  CLIP_ANALYSIS_ACTION_IDS,
  CLIP_ANALYSIS_WORKFLOW_ID,
} from './clip-analysis-workflow-definition';

describe('buildClipAnalysisWorkflowDefinition', () => {
  it('builds one fixed atomic action graph', () => {
    const workflow = buildClipAnalysisWorkflowDefinition();

    expect(workflow.canonicalId).toBe(CLIP_ANALYSIS_WORKFLOW_ID);
    expect(workflow.resultNodeId).toBe('persist-analysis');
    expect(workflow.definition.nodes).toHaveLength(5);
    expect(
      workflow.definition.nodes?.map((node) => node.data.config.actionId),
    ).toEqual([
      CLIP_ANALYSIS_ACTION_IDS.PREPARE_SOURCE,
      CLIP_ANALYSIS_ACTION_IDS.TRANSCRIBE,
      CLIP_ANALYSIS_ACTION_IDS.DETECT_HIGHLIGHTS,
      CLIP_ANALYSIS_ACTION_IDS.REFERENCE_FRAMES,
      CLIP_ANALYSIS_ACTION_IDS.PERSIST,
    ]);
    expect(workflow.definition.edges).toHaveLength(4);
  });
});

describe('buildClipAnalysisFailureWorkflowDefinition', () => {
  it('binds the terminal error and original job into the failure action', () => {
    const workflow = buildClipAnalysisFailureWorkflowDefinition();
    expect(workflow.definition.inputVariables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'workflowError',
          required: true,
          type: 'string',
        }),
      ]),
    );
    expect(workflow.definition.nodes?.[0].data.inputVariableKeys).toEqual([
      'job',
      'workflowError',
    ]);
  });
});
