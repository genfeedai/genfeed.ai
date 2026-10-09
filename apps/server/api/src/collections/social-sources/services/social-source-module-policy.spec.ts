import { buildSocialSourceHistoryImportWorkflowDefinition } from '@api/collections/social-sources/services/social-source-history-import-workflow-definition';
import {
  buildSocialSourceOwnAccountResyncItemWorkflowDefinition,
  buildSocialSourceOwnAccountResyncSweepWorkflowDefinition,
} from '@api/collections/social-sources/services/social-source-own-account-resync-workflow-definition';
import {
  buildScopedTrendsRefreshWorkflowDefinition,
  buildScopedTrendTaskWorkflowDefinition,
  buildTrendDatasetTaskWorkflowDefinition,
  buildTrendsRefreshWorkflowDefinition,
} from '@api/collections/trends/services/trends-maintenance-workflow-definition';

describe('Discovery tenant provider job policy', () => {
  it.each([
    buildSocialSourceHistoryImportWorkflowDefinition(),
    buildSocialSourceOwnAccountResyncItemWorkflowDefinition(),
    buildScopedTrendTaskWorkflowDefinition(),
  ])(
    '$canonicalId requires Discovery even for its result-producing action',
    (graph) => {
      expect(graph.organizationModule).toBe('discovery');
      expect(graph.moduleCompletionNodeIds).toBeUndefined();
      expect(graph.definition.nodes).toHaveLength(1);
      expect(graph.definition.nodes[0]?.id).toBe(graph.resultNodeId);
    },
  );

  it.each([
    buildSocialSourceOwnAccountResyncSweepWorkflowDefinition(),
    buildScopedTrendsRefreshWorkflowDefinition(),
    buildTrendsRefreshWorkflowDefinition(),
    buildTrendDatasetTaskWorkflowDefinition(),
  ])(
    '$canonicalId retains the infrastructure/global corpus contract',
    (graph) => {
      expect(graph.organizationModule).toBeUndefined();
      expect(graph.moduleCompletionNodeIds).toBeUndefined();
    },
  );
  it('collects independently denied tenant jobs in the scheduled resync sweep', () => {
    const sweep = buildSocialSourceOwnAccountResyncSweepWorkflowDefinition();
    expect(
      sweep.definition.nodes.find((node) => node.id === 'resync-sources')?.data
        .config.parameters,
    ).toMatchObject({ failureMode: 'collect', mode: 'scheduled' });
  });
});
