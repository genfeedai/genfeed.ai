import {
  BARE_URL_MCP_PROFILE,
  getToolsetNames,
  isMcpToolsetProfileName,
  MCP_PROFILE_NAMES,
  parseToolsetSelection,
  resolveMcpProfile,
  type ToolsetSelection,
} from '@genfeedai/actions';
import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import {
  hasExplicitToolsetsQuery,
  readProfileQueryParam,
  readToolsetsQueryParam,
} from '@mcp/shared/utils/toolsets-query.util';
import type { NextFunction, Request, Response } from 'express';

/** Cap on the unknown toolset names echoed back in the 400 message body. */
const MAX_ECHOED_UNKNOWN_TOOLSETS = 5;

/** Cap on a rejected profile name echoed back in the 400 message body. */
const MAX_ECHOED_PROFILE_LENGTH = 80;

export interface McpToolQueryResolution extends ToolsetSelection {
  unknownProfile: string | null;
}

/**
 * Parse `req.query.toolsets` into a selection scoped to the `mcp` surface.
 * A declared toolset with no tools on this deploy is `empty`, not `unknown`.
 * A name that is not a declared toolset is `unknown`. Does not apply
 * `?profile=` — {@link resolveMcpToolQuery} is the HTTP-boundary resolver.
 */
export function resolveRequestToolsets(
  query: Request['query'],
): ToolsetSelection {
  return parseToolsetSelection(readToolsetsQueryParam(query), 'mcp');
}

/**
 * Toolset selection for one MCP request.
 *
 * An explicit `?toolsets=` wins, including over `?profile=`. Otherwise
 * `?profile=` selects a named profile, and a bare URL (neither param) uses
 * `default`. `full` is the unfiltered catalog (empty `toolsets`). A declared
 * toolset with no tools on this deploy stays in `toolsets` and `empty`
 * instead of failing the connection.
 */
export function resolveMcpToolQuery(
  query: Request['query'],
): McpToolQueryResolution {
  const rawToolsets = readToolsetsQueryParam(query);
  if (hasExplicitToolsetsQuery(rawToolsets)) {
    return {
      ...parseToolsetSelection(rawToolsets, 'mcp'),
      unknownProfile: null,
    };
  }

  const requestedProfile = readProfileQueryParam(query) ?? BARE_URL_MCP_PROFILE;
  if (!isMcpToolsetProfileName(requestedProfile)) {
    return {
      empty: [],
      toolsets: [],
      unknown: [],
      unknownProfile: requestedProfile,
    };
  }

  const profile = resolveMcpProfile(requestedProfile);
  if (profile.kind === 'all') {
    return { empty: [], toolsets: [], unknown: [], unknownProfile: null };
  }

  return {
    ...parseToolsetSelection(profile.toolsets.join(','), 'mcp'),
    unknownProfile: null,
  };
}

/**
 * Human-readable reason an unknown toolset name was rejected. The echoed
 * unknown names are capped so a client that sends a long garbage list (or an
 * attacker probing the endpoint) cannot inflate the error body.
 */
export function buildUnknownToolsetsMessage(
  unknown: readonly string[],
): string {
  const shown = unknown.slice(0, MAX_ECHOED_UNKNOWN_TOOLSETS);
  const remaining = unknown.length - shown.length;
  const shownList =
    remaining > 0
      ? `${shown.join(', ')} (+${remaining} more)`
      : shown.join(', ');
  const validNames = getToolsetNames('mcp');
  return `Unknown toolset(s): ${shownList}. Valid toolsets: ${validNames.join(', ')}.`;
}

/**
 * JSON-RPC shaped error body for the raw `/mcp` transport, which speaks
 * JSON-RPC even for a request rejected before it reaches the SDK server.
 */
export function buildUnknownProfileMessage(profile: string): string {
  const shown = profile.trim().slice(0, MAX_ECHOED_PROFILE_LENGTH);
  return `Unknown profile: ${shown}. Valid profiles: ${MCP_PROFILE_NAMES.join(', ')}.`;
}

export function buildUnknownToolsetsJsonRpcError(unknown: readonly string[]) {
  return jsonRpcInvalidParams(buildUnknownToolsetsMessage(unknown));
}

export function buildUnknownProfileJsonRpcError(profile: string) {
  return jsonRpcInvalidParams(buildUnknownProfileMessage(profile));
}

function jsonRpcInvalidParams(message: string) {
  return {
    error: {
      code: -32602,
      message,
    },
    id: null,
    jsonrpc: '2.0' as const,
  };
}

/**
 * Reads `?toolsets=` and `?profile=` before authentication so an unknown
 * name is rejected the same way for an authenticated caller and an
 * unauthenticated public discovery request (`tools/list`). On success it
 * stores the parsed selection on `req.toolsets` for
 * `StreamableHttpService.buildServer` to thread into `ToolRegistryService`.
 * A declared toolset with no tools on this deploy is not a 400 — it stays
 * in the selection and `list_toolsets` warns about it.
 */
export function toolsetsQueryMiddleware(
  req: McpRequest,
  res: Response,
  next: NextFunction,
): void {
  const selection = resolveMcpToolQuery(req.query);

  if (selection.unknownProfile) {
    res
      .status(400)
      .json(buildUnknownProfileJsonRpcError(selection.unknownProfile));
    return;
  }

  if (selection.unknown.length > 0) {
    res.status(400).json(buildUnknownToolsetsJsonRpcError(selection.unknown));
    return;
  }

  req.toolsets = selection.toolsets;
  next();
}
