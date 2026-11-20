import { getRetiredMcpCatalogTool } from '@genfeedai/actions';

interface McpToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * Takes a call written with an original tool name and returns the merged call
 * that runs the same tool. `organization` names the organization of the call,
 * so it stays beside `action` instead of moving into the action's input.
 */
export function asMergedToolCall(call: McpToolCall): {
  name: string;
  arguments: Record<string, unknown>;
} {
  const operation = getRetiredMcpCatalogTool(call.name);
  if (!operation) return { arguments: call.arguments ?? {}, name: call.name };
  const { organization, ...input } = call.arguments ?? {};
  return {
    arguments: {
      action: operation.action,
      input,
      ...(organization === undefined ? {} : { organization }),
    },
    name: operation.canonicalName,
  };
}
