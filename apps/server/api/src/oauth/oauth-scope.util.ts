import {
  API_KEY_SCOPE_PRESETS,
  MCP_CLAUDE_SCOPE_CEILING,
} from '@genfeedai/contracts/constants';
import { resolveMcpAccessModeForResource } from '@genfeedai/helpers/integrations/mcp-resource.helper';

/**
 * The scopes an MCP grant for `resource` may carry. Claude connector
 * resources stay under a narrower ceiling than the standard resource.
 */
export function resolveMcpScopeCeiling(resource: string): readonly string[] {
  return resolveMcpAccessModeForResource(resource) === 'claude'
    ? MCP_CLAUDE_SCOPE_CEILING
    : API_KEY_SCOPE_PRESETS.mcp;
}

/**
 * The requested scopes that fit under the resource's ceiling, or an empty
 * list when none do. No request means the whole ceiling. Callers decide the
 * error: the consent flow answers `invalid_scope` for an empty result.
 */
export function clampMcpScopes(
  scope: string | undefined,
  resource: string,
): string[] {
  const ceiling = resolveMcpScopeCeiling(resource);
  const requested = scope
    ? Array.from(new Set(scope.split(/\s+/).filter(Boolean)))
    : [...ceiling];
  return requested.filter((candidate) => ceiling.includes(candidate));
}
