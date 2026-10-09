import {
  buildRssItemWorkflowDefinition,
  buildRssSourceWorkflowDefinition,
  buildRssSweepWorkflowDefinition,
  RSS_SWEEP_ACTION_IDS,
  RSS_SWEEP_WORKFLOW_IDS,
} from '@api/collections/rss-sources/services/rss-sweep-workflow-definition';

describe('RSS Publishing job policy', () => {
  it.each([
    {
      graph: buildRssSourceWorkflowDefinition(),
      completion: 'finalize-source',
      actionId: RSS_SWEEP_ACTION_IDS.FINALIZE_SOURCE,
    },
    {
      graph: buildRssItemWorkflowDefinition(),
      completion: 'finalize-item',
      actionId: RSS_SWEEP_ACTION_IDS.FINALIZE_ITEM,
    },
  ])(
    '$graph.canonicalId gates new work and only exempts result persistence',
    ({ graph, completion, actionId }) => {
      expect(graph.organizationModule).toBe('publishing');
      expect(graph.moduleCompletionNodeIds).toEqual([completion]);
      const node = graph.definition.nodes.find(
        (candidate) => candidate.id === completion,
      );
      expect(node?.data.config.actionId).toBe(actionId);
      expect(
        graph.definition.edges.some((edge) => edge.source === completion),
      ).toBe(false);
    },
  );

  it('keeps the global coordinator unassigned and collects tenant admission failures', () => {
    const sweep = buildRssSweepWorkflowDefinition();
    expect(sweep.organizationModule).toBeUndefined();
    expect(sweep.moduleCompletionNodeIds).toBeUndefined();
    expect(
      sweep.definition.nodes.find((node) => node.id === 'process-sources')?.data
        .config.parameters,
    ).toMatchObject({
      childWorkflowId: RSS_SWEEP_WORKFLOW_IDS.SOURCE,
      failureMode: 'collect',
      mode: 'await',
    });
  });
});
