import {
  buildTelegramDistributionWorkflowDefinition,
  TELEGRAM_DISTRIBUTION_ACTION_IDS,
} from '@api/services/distribution/telegram/telegram-distribution-workflow-definition';

describe('Telegram delivery Publishing policy', () => {
  it('gates new deliveries and only exempts the prior delivery outcome', () => {
    const graph = buildTelegramDistributionWorkflowDefinition();
    expect(graph.organizationModule).toBe('publishing');
    expect(graph.moduleCompletionNodeIds).toEqual(['finalize-delivery']);
    expect(
      graph.definition.nodes.find((node) => node.id === 'finalize-delivery')
        ?.data.config.actionId,
    ).toBe(TELEGRAM_DISTRIBUTION_ACTION_IDS.FINALIZE);
    expect(
      graph.definition.edges.some(
        (edge) => edge.source === 'finalize-delivery',
      ),
    ).toBe(false);
  });
});
