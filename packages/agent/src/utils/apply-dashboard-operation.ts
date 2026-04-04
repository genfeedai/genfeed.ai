import { useAgentDashboardStore } from '@cloud/agent/stores/agent-dashboard.store';
import type { AgentDashboardOperation, AgentUIBlock } from '@cloud/interfaces';

export function applyDashboardOperation(
  operation: AgentDashboardOperation,
  blocks?: AgentUIBlock[],
  blockIds?: string[],
): void {
  const store = useAgentDashboardStore.getState();
  switch (operation) {
    case 'replace':
      store.setBlocks(blocks || []);
      break;
    case 'add':
      for (const block of blocks || []) {
        store.addBlock(block);
      }
      break;
    case 'update':
      for (const block of blocks || []) {
        store.updateBlock(block.id, block);
      }
      break;
    case 'remove':
      for (const id of blockIds || []) {
        store.removeBlock(id);
      }
      break;
    case 'clear':
      store.clearAll();
      break;
  }
}
