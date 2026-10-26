import { normalizeUiBlocks } from '@api/services/agent-orchestrator/utils/agent-ui-blocks.util';
import type { AgentDashboardOperation } from '@genfeedai/contracts/interfaces';

interface DashboardBlocksState {
  latestUiBlocks: {
    blockIds?: string[];
    blocks?: unknown[];
    operation: AgentDashboardOperation;
  } | null;
}

interface DashboardBlocksStrategy {
  onUiBlocks?: (event: {
    blockIds?: string[];
    blocks: ReturnType<typeof normalizeUiBlocks>;
    deferPublish: boolean;
    operation: AgentDashboardOperation;
    resultData: Record<string, unknown>;
  }) => Promise<void>;
}

/** Records the latest `render_dashboard` blocks and lets the mode publish them. */
export async function recordDashboardBlocks(
  state: DashboardBlocksState,
  strategy: DashboardBlocksStrategy,
  data: Record<string, unknown>,
): Promise<void> {
  const blocks = normalizeUiBlocks(data.uiBlocks as unknown[]);
  const blockIds = data.blockIds as string[] | undefined;
  const operation = data.operation as AgentDashboardOperation;
  state.latestUiBlocks = { blockIds, blocks, operation };

  await strategy.onUiBlocks?.({
    blockIds,
    blocks,
    deferPublish: Boolean(data.deferUiBlocksPublish),
    operation,
    resultData: data,
  });
}
