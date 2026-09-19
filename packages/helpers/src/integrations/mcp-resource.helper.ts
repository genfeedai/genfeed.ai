import type { McpResourceIdentifierResolution } from '@genfeedai/contracts/interfaces';

/**
 * Environment variables consulted, in order, for the public MCP URL. The
 * API (OAuth authorization server) and the MCP server MUST read the same
 * list in the same order so the `resource` they advertise and enforce is
 * identical (#4553).
 */
export const MCP_RESOURCE_URL_ENV_KEYS = [
  'GENFEEDAI_MCP_PUBLIC_URL',
  'GENFEEDAI_MICROSERVICES_MCP_URL',
] as const;

/** Path component of the MCP endpoint on every deployment. */
export const MCP_RESOURCE_PATH = '/mcp';

/** Well-known path for RFC 9728 protected-resource metadata. */
export const OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH =
  '/.well-known/oauth-protected-resource';

export class McpResourceConfigurationError extends Error {
  readonly sourceKey: string | null;

  constructor(sourceKey: string | null, reason: string) {
    const origin = sourceKey ?? 'the MCP URL fallback';
    super(`Invalid MCP resource URL from ${origin}: ${reason}`);
    this.name = 'McpResourceConfigurationError';
    this.sourceKey = sourceKey;
  }
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
}

/**
 * Derive the canonical protected-resource identifier from one configured
 * URL. Accepts the URL with or without a trailing `/mcp` path and with or
 * without a trailing slash; every spelling yields the same identifier.
 *
 * - `https://mcp.genfeed.ai` → `https://mcp.genfeed.ai/mcp`
 * - `https://mcp.genfeed.ai/` → `https://mcp.genfeed.ai/mcp`
 * - `https://mcp.genfeed.ai/mcp` → `https://mcp.genfeed.ai/mcp`
 * - `https://mcp.genfeed.ai/mcp/` → `https://mcp.genfeed.ai/mcp`
 *
 * Query strings and fragments are never part of a resource identifier
 * (RFC 8707 §2) and are rejected so a `?toolsets=` endpoint override cannot
 * silently become a different resource than the one the API enforces.
 */
export function deriveMcpResourceIdentifier(
  configuredUrl: string,
  sourceKey: string | null = null,
): string {
  let parsed: URL;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    throw new McpResourceConfigurationError(sourceKey, 'not an absolute URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new McpResourceConfigurationError(
      sourceKey,
      'protocol must be http or https',
    );
  }
  if (parsed.search || parsed.hash) {
    throw new McpResourceConfigurationError(
      sourceKey,
      'query strings and fragments are not allowed in a resource identifier',
    );
  }

  const path = trimTrailingSlashes(parsed.pathname);
  const resourcePath =
    path === MCP_RESOURCE_PATH || path.endsWith(MCP_RESOURCE_PATH)
      ? path
      : `${path}${MCP_RESOURCE_PATH}`;

  return `${parsed.origin}${resourcePath}`;
}

/**
 * Resolve the identifier from an environment reader. The first configured
 * key in `MCP_RESOURCE_URL_ENV_KEYS` wins; a configured but invalid value is
 * an error naming that key (deployments fail at startup, not at a user's
 * token exchange). The fallback is only used when no key is set.
 */
export function resolveMcpResourceIdentifier(
  readEnv: (key: string) => string | undefined,
  fallback: string,
): McpResourceIdentifierResolution {
  for (const key of MCP_RESOURCE_URL_ENV_KEYS) {
    const value = readEnv(key);
    if (typeof value === 'string' && value.trim().length > 0) {
      return {
        identifier: deriveMcpResourceIdentifier(value.trim(), key),
        sourceKey: key,
      };
    }
  }
  return {
    identifier: deriveMcpResourceIdentifier(fallback, null),
    sourceKey: null,
  };
}

/**
 * RFC 9728 §3: metadata for a resource whose identifier carries a path
 * component is served at the well-known path suffixed with that path
 * (`/.well-known/oauth-protected-resource/mcp`). The bare path remains
 * served for clients that ignore §3.
 */
export function buildProtectedResourceMetadataPaths(
  resourceIdentifier: string,
): string[] {
  const { pathname } = new URL(resourceIdentifier);
  const suffix = trimTrailingSlashes(pathname);
  if (!suffix || suffix === '/') {
    return [OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH];
  }
  return [
    OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH,
    `${OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH}${suffix}`,
  ];
}
