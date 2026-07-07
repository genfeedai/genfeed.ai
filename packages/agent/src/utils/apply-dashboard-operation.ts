import type { DashboardBlocksParseResult } from '@genfeedai/agent/dashboard';
import {
  parseAgentDashboardBlocks,
  parseDashboardOpenUIDocument,
} from '@genfeedai/agent/dashboard/dashboard-openui';
import { useAgentDashboardStore } from '@genfeedai/agent/stores/agent-dashboard.store';
import type { AgentDashboardOperation } from '@genfeedai/interfaces';

function normalizeDashboardOperation(
  operation: AgentDashboardOperation | string,
): AgentDashboardOperation {
  if (
    operation === 'add' ||
    operation === 'update' ||
    operation === 'remove' ||
    operation === 'clear'
  ) {
    return operation;
  }

  return 'replace';
}

function normalizeBlockIds(blockIds?: unknown): string[] {
  if (!Array.isArray(blockIds)) {
    return [];
  }
  return blockIds.filter((id): id is string => typeof id === 'string');
}

function isOpenUIDocumentPayload(blocks?: unknown): boolean {
  return (
    typeof blocks === 'object' &&
    blocks !== null &&
    !Array.isArray(blocks) &&
    ('components' in blocks || 'version' in blocks)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDashboardPayload(blocks?: unknown): DashboardBlocksParseResult {
  if (isRecord(blocks) && 'blocks' in blocks) {
    return parseDashboardPayload(blocks.blocks);
  }

  return isOpenUIDocumentPayload(blocks)
    ? parseDashboardOpenUIDocument(blocks)
    : parseAgentDashboardBlocks(blocks);
}

export function applyDashboardOperation(
  operation: AgentDashboardOperation | string,
  blocks?: unknown,
  blockIds?: unknown,
): void {
  const store = useAgentDashboardStore.getState();
  const normalizedOperation = normalizeDashboardOperation(operation);
  const parsed = parseDashboardPayload(blocks);

  if (
    !parsed.ok &&
    normalizedOperation !== 'remove' &&
    normalizedOperation !== 'clear'
  ) {
    store.setBlocks(parsed.blocks);
    return;
  }

  switch (normalizedOperation) {
    case 'replace':
      store.setBlocks(parsed.blocks);
      break;
    case 'add':
      for (const block of parsed.blocks) {
        store.addBlock(block);
      }
      break;
    case 'update':
      for (const block of parsed.blocks) {
        store.updateBlock(block.id, block);
      }
      break;
    case 'remove':
      for (const id of normalizeBlockIds(blockIds)) {
        store.removeBlock(id);
      }
      break;
    case 'clear':
      store.clearAll();
      break;
  }
}
