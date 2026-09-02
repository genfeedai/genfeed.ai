import type { AgentUIBlock } from '@genfeedai/contracts/interfaces';

/**
 * Coerce an unknown array into AgentUIBlock[].
 * Drops non-object entries (null, primitives) so render_dashboard payloads
 * stay safe for persistence and SSE without duplicating this filter.
 */
export function normalizeUiBlocks(blocks: unknown[]): AgentUIBlock[] {
  const normalized: AgentUIBlock[] = [];

  for (const block of blocks) {
    if (!block || typeof block !== 'object') {
      continue;
    }

    normalized.push(block as AgentUIBlock);
  }

  return normalized;
}
