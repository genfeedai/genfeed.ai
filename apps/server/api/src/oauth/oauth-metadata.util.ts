import { API_KEY_SCOPE_PRESETS } from '@genfeedai/contracts/constants';
import { resolveMcpResourceIdentifier } from '@genfeedai/helpers/integrations/mcp-resource.helper';
import type { ConfigService } from '@libs/config/config.service';

const DEFAULT_API_URL = 'http://localhost:3010';
const DEFAULT_APP_URL = 'http://localhost:3000';
const DEFAULT_MCP_URL = 'http://localhost:3014/mcp';
const DEFAULT_DOCS_URL = 'https://docs.genfeed.ai';
const DEFAULT_WEBSITE_URL = 'https://genfeed.ai';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function readUrl(
  configService: Pick<ConfigService, 'get'>,
  keys: string[],
  fallback: string,
): string {
  for (const key of keys) {
    const value = configService.get(key);
    if (typeof value === 'string' && value.length > 0) {
      return trimTrailingSlash(value);
    }
  }
  return trimTrailingSlash(fallback);
}

export function resolveOAuthIssuerUrl(
  configService: Pick<ConfigService, 'get'>,
): string {
  return readUrl(
    configService,
    ['GENFEEDAI_API_PUBLIC_URL', 'GENFEEDAI_API_URL'],
    DEFAULT_API_URL,
  );
}

export function resolveOAuthAppUrl(
  configService: Pick<ConfigService, 'get'>,
): string {
  return readUrl(configService, ['GENFEEDAI_APP_URL'], DEFAULT_APP_URL);
}

/**
 * The protected-resource identifier the token endpoint enforces. Derived by
 * the same shared rule the MCP server advertises (#4553), so every spelling
 * of the configured URL yields one identifier.
 */
export function resolveMcpResourceUrl(
  configService: Pick<ConfigService, 'get'>,
): string {
  return resolveMcpResourceIdentifier((key) => {
    const value = configService.get(key);
    return typeof value === 'string' ? value : undefined;
  }, DEFAULT_MCP_URL).identifier;
}

/**
 * Query parameters that only pick which MCP tools a connection lists. The
 * setup page and the plugin bundle hand out endpoint URLs carrying them, and
 * a client may send that URL as its RFC 8707 `resource`.
 */
const MCP_ROUTING_QUERY_PARAMS = new Set(['profile', 'toolsets']);

/**
 * The resource a client asked for, without the MCP routing query. Any other
 * query, a fragment, or a different origin or path is kept, so it still
 * fails the exact comparison against the advertised identifier.
 */
export function canonicalizeRequestedMcpResource(resource: string): string {
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    return resource;
  }
  // `url.hash` is empty for a bare trailing `#`, so check the raw value.
  if (resource.includes('#') || url.username || url.password) {
    return resource;
  }
  const keys = [...url.searchParams.keys()];
  if (
    keys.length === 0 ||
    keys.some((key) => !MCP_ROUTING_QUERY_PARAMS.has(key))
  ) {
    return resource;
  }
  return trimTrailingSlash(`${url.origin}${url.pathname}`);
}

export function buildOAuthAuthorizationServerMetadata(
  configService: Pick<ConfigService, 'get'>,
) {
  const issuer = resolveOAuthIssuerUrl(configService);
  // Policies and docs belong to the operator serving this issuer.
  const websiteUrl = readUrl(
    configService,
    ['GENFEEDAI_PUBLIC_URL'],
    DEFAULT_WEBSITE_URL,
  );
  const docsUrl = readUrl(
    configService,
    ['GENFEED_DOCS_URL'],
    DEFAULT_DOCS_URL,
  );
  const protectedResources = [resolveMcpResourceUrl(configService)];
  const agentAuthRegistrationUrl = `${issuer}/v1/agent/auth`;
  const agentAuthClaimUrl = `${agentAuthRegistrationUrl}/claim`;
  const agentAuthRevocationUrl = `${agentAuthRegistrationUrl}/revoke`;

  return {
    agent_auth: {
      claim_endpoint: agentAuthClaimUrl,
      claim_uri: agentAuthClaimUrl,
      identity_endpoint: agentAuthRegistrationUrl,
      identity_types_supported: ['identity_assertion', 'service_auth'],
      identity_assertion: {
        assertion_types_supported: ['verified_email'],
        credential_types_supported: ['api_key'],
      },
      register_uri: agentAuthRegistrationUrl,
      revocation_uri: agentAuthRevocationUrl,
      service_auth: {
        credential_types_supported: ['api_key'],
      },
      skill: 'https://genfeed.ai/auth.md',
    },
    authorization_endpoint: `${issuer}/v1/oauth/authorize`,
    code_challenge_methods_supported: ['S256'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    issuer,
    op_policy_uri: `${websiteUrl}/privacy`,
    op_tos_uri: `${websiteUrl}/terms`,
    protected_resources: protectedResources,
    registration_endpoint: `${issuer}/v1/oauth/register`,
    response_types_supported: ['code'],
    revocation_endpoint: `${issuer}/v1/oauth/revoke`,
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...API_KEY_SCOPE_PRESETS.mcp],
    service_documentation: `${docsUrl}/api-reference/mcp`,
    token_endpoint: `${issuer}/v1/oauth/token`,
    token_endpoint_auth_methods_supported: ['none'],
  };
}
