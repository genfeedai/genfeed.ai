import { API_KEY_SCOPE_PRESETS } from '@genfeedai/constants';
import type { ConfigService } from '@libs/config/config.service';

const DEFAULT_API_URL = 'http://localhost:3010';
const DEFAULT_APP_URL = 'http://localhost:3000';
const DEFAULT_MCP_URL = 'http://localhost:3014/mcp';

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

export function resolveMcpResourceUrl(
  configService: Pick<ConfigService, 'get'>,
): string {
  const configured = readUrl(
    configService,
    ['GENFEEDAI_MCP_PUBLIC_URL', 'GENFEEDAI_MICROSERVICES_MCP_URL'],
    DEFAULT_MCP_URL,
  );
  return configured.endsWith('/mcp') ? configured : `${configured}/mcp`;
}

export function buildOAuthAuthorizationServerMetadata(
  configService: Pick<ConfigService, 'get'>,
) {
  const issuer = resolveOAuthIssuerUrl(configService);
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
    grant_types_supported: ['authorization_code'],
    issuer,
    protected_resources: protectedResources,
    registration_endpoint: `${issuer}/v1/oauth/register`,
    response_types_supported: ['code'],
    scopes_supported: [...API_KEY_SCOPE_PRESETS.mcp],
    token_endpoint: `${issuer}/v1/oauth/token`,
    token_endpoint_auth_methods_supported: ['none'],
  };
}
