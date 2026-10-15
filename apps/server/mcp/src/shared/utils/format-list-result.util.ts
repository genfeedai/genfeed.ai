export function formatListResult(
  items: readonly unknown[],
  noun: string,
  qualifier = '',
): string {
  return items.length > 0
    ? `Found ${items.length} ${noun}${qualifier}:\n\n${formatToolData(items)}`
    : `No ${noun} found${qualifier}.`;
}

import { formatToolData } from '@mcp/shared/utils/tool-result-text.util';
