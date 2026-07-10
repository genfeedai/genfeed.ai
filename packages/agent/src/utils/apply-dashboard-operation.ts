import type { DashboardBlocksParseResult } from '@genfeedai/agent/dashboard';
import {
  parseAgentDashboardBlocks,
  parseDashboardOpenUIDocument,
} from '@genfeedai/agent/dashboard/dashboard-openui';
import { useAgentDashboardStore } from '@genfeedai/agent/stores/agent-dashboard.store';
import type { AgentDashboardOperation } from '@genfeedai/interfaces';

function normalizeDashboardOperation(
  operation: AgentDashboardOperation | string,
): AgentDashboardOperation | undefined {
  if (
    operation === 'replace' ||
    operation === 'add' ||
    operation === 'update' ||
    operation === 'remove' ||
    operation === 'clear'
  ) {
    return operation;
  }

  // Unrecognized operations (typos, future server-side operation names) must
  // no-op rather than fall through to the destructive 'replace'.
  return undefined;
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

// Bounds the `{ blocks }` unwrap so circular or deeply nested payloads fail
// validation instead of overflowing the stack.
const MAX_PAYLOAD_UNWRAP_DEPTH = 8;

function parseDashboardPayload(
  blocks?: unknown,
  depth = 0,
): DashboardBlocksParseResult {
  if (
    depth < MAX_PAYLOAD_UNWRAP_DEPTH &&
    isRecord(blocks) &&
    'blocks' in blocks
  ) {
    return parseDashboardPayload(blocks.blocks, depth + 1);
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
  if (normalizedOperation === undefined) {
    return;
  }
  const parsed = parseDashboardPayload(blocks);

  if (
    !parsed.isValid &&
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
