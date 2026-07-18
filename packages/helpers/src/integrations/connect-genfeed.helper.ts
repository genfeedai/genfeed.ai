import type {
  ConnectGenfeedClient,
  ConnectGenfeedInstructions,
} from '@genfeedai/interfaces';

const ENVIRONMENT_VARIABLE = 'GENFEED_API_KEY';

function normalizeEndpoint(endpoint: string): string {
  const url = new URL(endpoint);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The MCP endpoint must use HTTP or HTTPS.');
  }

  return endpoint.replace(/\/+$/, '');
}

export function buildConnectGenfeedInstructions(
  client: ConnectGenfeedClient,
  endpoint: string,
): ConnectGenfeedInstructions {
  const mcpEndpoint = normalizeEndpoint(endpoint);
  const environmentCommand = `read -s ${ENVIRONMENT_VARIABLE} && export ${ENVIRONMENT_VARIABLE}`;

  if (client === 'claude-code') {
    return {
      client,
      configuration: [
        'Remote Streamable HTTP server: genfeed',
        `Endpoint: ${mcpEndpoint}`,
        `Authorization: Bearer $${ENVIRONMENT_VARIABLE}`,
      ].join('\n'),
      environmentCommand,
      primaryCommand: `claude mcp add --transport http genfeed --scope user ${mcpEndpoint} --header "Authorization: Bearer $${ENVIRONMENT_VARIABLE}"`,
      verifyCommand: 'claude mcp list',
    };
  }

  if (client === 'codex') {
    return {
      client,
      configuration: [
        '[mcp_servers.genfeed]',
        `url = "${mcpEndpoint}"`,
        `bearer_token_env_var = "${ENVIRONMENT_VARIABLE}"`,
      ].join('\n'),
      environmentCommand,
      primaryCommand: `codex mcp add genfeed --url ${mcpEndpoint} --bearer-token-env-var ${ENVIRONMENT_VARIABLE}`,
      verifyCommand: 'codex mcp list',
    };
  }

  return {
    client,
    configuration: JSON.stringify(
      {
        headers: {
          Authorization: `Bearer \${${ENVIRONMENT_VARIABLE}}`,
        },
        transport: 'streamable-http',
        url: mcpEndpoint,
      },
      null,
      2,
    ),
    environmentCommand,
  };
}
