import {
  buildPatternCandidateWorkflowDefinition,
  buildPatternExtractionWorkflowDefinition,
  PATTERN_EXTRACTION_ACTION_IDS,
  PATTERN_EXTRACTION_ITEM_WORKFLOW_ID,
} from '@workers/processors/api/queues/pattern-extraction/pattern-extraction-workflow-definition';

describe('pattern extraction workflow definitions', () => {
  it('uses an organization-scoped parent graph and generic child fan-out', () => {
    const definition = buildPatternExtractionWorkflowDefinition();
    const fanOut = definition.definition.nodes.find(
      (node) => node.id === 'persist-patterns',
    );

    expect(definition.canonicalId).toBe('patterns.extract-organization');
    expect(definition.definition.inputVariables).toEqual([]);
    expect(fanOut?.data.config.actionId).toBe('workflow.for-each');
    expect(fanOut?.data?.config).toMatchObject({
      childWorkflowId: PATTERN_EXTRACTION_ITEM_WORKFLOW_ID,
      mode: 'await',
    });
  });

  it('persists each candidate through one reusable action', () => {
    const definition = buildPatternCandidateWorkflowDefinition();

    expect(definition.definition.nodes).toHaveLength(1);
    expect(definition.definition.nodes[0]?.data.config.actionId).toBe(
      PATTERN_EXTRACTION_ACTION_IDS.PERSIST,
    );
  });
});
