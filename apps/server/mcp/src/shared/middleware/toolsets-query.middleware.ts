import {
  getToolsets,
  parseToolsetSelection,
  type ToolsetSelection,
} from '@genfeedai/actions';
import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import { readToolsetsQueryParam } from '@mcp/shared/utils/toolsets-query.util';
import type { NextFunction, Request, Response } from 'express';

/**
 * Parse `req.query.toolsets` into a validated selection. Exported standalone
 * (not just embedded in the middleware) so both the raw `/mcp` transport
 * (`main.ts`) and the REST mirror (`GET /v1/tools`) resolve the same
 * selection from the same query shape.
 */
export function resolveRequestToolsets(
  query: Request['query'],
): ToolsetSelection {
  return parseToolsetSelection(readToolsetsQueryParam(query));
}

/** Human-readable reason an unknown toolset name was rejected. */
export function buildUnknownToolsetsMessage(
  unknown: readonly string[],
): string {
  const validNames = getToolsets('mcp').map((toolset) => toolset.name);
  return `Unknown toolset(s): ${unknown.join(', ')}. Valid toolsets: ${validNames.join(', ')}.`;
}

/**
 * JSON-RPC shaped error body for the raw `/mcp` transport, which speaks
 * JSON-RPC even for a request rejected before it reaches the SDK server.
 */
export function buildUnknownToolsetsJsonRpcError(unknown: readonly string[]) {
  return {
    error: {
      code: -32602,
      message: buildUnknownToolsetsMessage(unknown),
    },
    id: null,
    jsonrpc: '2.0' as const,
  };
}

/**
 * Reads `?toolsets=` before authentication so an unknown toolset name is
 * rejected the same way for an authenticated caller and an unauthenticated
 * public discovery request (`tools/list`). On success it stores the parsed
 * selection on `req.toolsets` for `StreamableHttpService.buildServer` to
 * thread into `ToolRegistryService`.
 */
export function toolsetsQueryMiddleware(
  req: McpRequest,
  res: Response,
  next: NextFunction,
): void {
  const selection = resolveRequestToolsets(req.query);

  if (selection.unknown.length > 0) {
    res.status(400).json(buildUnknownToolsetsJsonRpcError(selection.unknown));
    return;
  }

  req.toolsets = selection.toolsets;
  next();
}
