import {
  buildClipperAnalysisFailureWorkflowDefinition,
  buildClipperAnalysisWorkflowDefinition,
  CLIPPER_ANALYSIS_ACTION_IDS,
  CLIPPER_ANALYSIS_WORKFLOW_ID,
} from './clipper-analysis-workflow-definition';

describe('buildClipperAnalysisWorkflowDefinition', () => {
  it('builds one fixed atomic action graph', () => {
    const workflow = buildClipperAnalysisWorkflowDefinition();

    expect(workflow.canonicalId).toBe(CLIPPER_ANALYSIS_WORKFLOW_ID);
    expect(workflow.resultNodeId).toBe('persist-analysis');
    expect(workflow.definition.nodes).toHaveLength(5);
    expect(
      workflow.definition.nodes?.map((node) => node.data.config.actionId),
    ).toEqual([
      CLIPPER_ANALYSIS_ACTION_IDS.PREPARE_SOURCE,
      CLIPPER_ANALYSIS_ACTION_IDS.TRANSCRIBE,
      CLIPPER_ANALYSIS_ACTION_IDS.DETECT_HIGHLIGHTS,
      CLIPPER_ANALYSIS_ACTION_IDS.REFERENCE_FRAMES,
      CLIPPER_ANALYSIS_ACTION_IDS.PERSIST,
    ]);
    expect(workflow.definition.edges).toHaveLength(4);
  });
});

describe('buildClipperAnalysisFailureWorkflowDefinition', () => {
  it('binds the terminal error and original job into the failure action', () => {
    const workflow = buildClipperAnalysisFailureWorkflowDefinition();
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
