import {
  buildScopedTrendsRefreshWorkflowDefinition,
  buildScopedTrendTaskWorkflowDefinition,
  buildTrendDatasetTaskWorkflowDefinition,
  buildTrendsRefreshWorkflowDefinition,
  TRENDS_MAINTENANCE_ACTION_IDS,
} from '@api/collections/trends/services/trends-maintenance-workflow-definition';

describe('trends maintenance workflow definitions', () => {
  it('builds refresh as action-backed steps including preview warmup', () => {
    const definition = buildTrendsRefreshWorkflowDefinition();
    const actionIds = definition.definition.nodes.flatMap((node) =>
      node.type === 'genfeedAction' &&
      typeof node.data.config.actionId === 'string'
        ? [node.data.config.actionId]
        : [],
    );
    expect(actionIds).toContain(
      TRENDS_MAINTENANCE_ACTION_IDS.PRECOMPUTE_PREVIEW,
    );
    expect(actionIds).toContain('workflow.for-each');
    expect(definition.definition.edges.length).toBeGreaterThan(1);
  });

  it('keeps each dataset fetch in its child workflow', () => {
    const definition = buildTrendDatasetTaskWorkflowDefinition();
    expect(definition.definition.nodes).toHaveLength(1);
    expect(definition.definition.nodes[0]).toEqual(
      expect.objectContaining({ type: 'genfeedAction' }),
    );
  });

  it('fans connected scopes into tenant-isolated native child workflows', () => {
    const sweep = buildScopedTrendsRefreshWorkflowDefinition();
    const task = buildScopedTrendTaskWorkflowDefinition();

    expect(sweep.definition.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            config: expect.objectContaining({
              actionId: 'workflow.for-each-tenant',
            }),
          }),
        }),
      ]),
    );
    expect(task.definition.nodes).toEqual([
      expect.objectContaining({ type: 'genfeedAction' }),
    ]);
  });
});
