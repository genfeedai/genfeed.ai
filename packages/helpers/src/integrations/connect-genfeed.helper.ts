import type {
  ConnectGenfeedAuthMethod,
  ConnectGenfeedClient,
  ConnectGenfeedInstructions,
} from '@genfeedai/contracts/interfaces';

const ENVIRONMENT_VARIABLE = 'GENFEED_API_KEY';

function normalizeEndpoint(endpoint: string): string {
  const url = new URL(endpoint);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The MCP endpoint must use HTTP or HTTPS.');
  }

  let end = endpoint.length;
  while (end > 0 && endpoint[end - 1] === '/') {
    end -= 1;
  }

  return end === endpoint.length ? endpoint : endpoint.slice(0, end);
}

export function buildConnectGenfeedInstructions(
  client: ConnectGenfeedClient,
  endpoint: string,
  authMethod: ConnectGenfeedAuthMethod = 'oauth',
): ConnectGenfeedInstructions {
  const mcpEndpoint = normalizeEndpoint(endpoint);
  const shellEndpoint = /^[A-Za-z0-9:/._-]+$/.test(mcpEndpoint)
    ? mcpEndpoint
    : `'${mcpEndpoint.replace(/'/g, `'"'"'`)}'`;

  if (authMethod === 'oauth') {
    const authorizationInstruction =
      client === 'codex'
        ? 'Run codex mcp login genfeed if authorization did not open during setup. Sign in and approve access in your browser, then return to Codex.'
        : client === 'claude-code'
          ? 'Open /mcp inside Claude Code, select genfeed, and authenticate. Sign in and approve access in your browser, then return to Claude Code.'
          : 'Add this endpoint as a remote Streamable HTTP server in your client, choose OAuth, and complete browser sign-in and consent. If your client does not support OAuth, use the advanced manual-key path.';
    return {
      authMethod,
      authorizationInstruction,
      client,
      configuration:
        client === 'codex'
          ? `[mcp_servers.genfeed]\nurl = ${JSON.stringify(mcpEndpoint)}`
          : JSON.stringify(
              { transport: 'streamable-http', url: mcpEndpoint },
              null,
              2,
            ),
      environmentCommand: '',
      primaryCommand:
        client === 'codex'
          ? `codex mcp add genfeed --url ${shellEndpoint}`
          : client === 'claude-code'
            ? `claude mcp add --transport http genfeed --scope user ${shellEndpoint}`
            : undefined,
      verifyCommand:
        client === 'codex'
          ? 'codex mcp list'
          : client === 'claude-code'
            ? 'claude mcp list'
            : undefined,
    };
  }

  const environmentCommand = `read -s ${ENVIRONMENT_VARIABLE} && export ${ENVIRONMENT_VARIABLE}`;

  if (client === 'claude-code') {
    return {
      authMethod,
      authorizationInstruction:
        'Configure your client with the scoped key, then verify the connection.',
      client,
      configuration: [
        'Remote Streamable HTTP server: genfeed',
        `Endpoint: ${mcpEndpoint}`,
        `Authorization: Bearer $${ENVIRONMENT_VARIABLE}`,
      ].join('\n'),
      environmentCommand,
      primaryCommand: `claude mcp add --transport http genfeed --scope user ${shellEndpoint} --header "Authorization: Bearer $${ENVIRONMENT_VARIABLE}"`,
      verifyCommand: 'claude mcp list',
    };
  }

  if (client === 'codex') {
    return {
      authMethod,
      authorizationInstruction:
        'Configure your client with the scoped key, then verify the connection.',
      client,
      configuration: [
        '[mcp_servers.genfeed]',
        `url = ${JSON.stringify(mcpEndpoint)}`,
        `bearer_token_env_var = "${ENVIRONMENT_VARIABLE}"`,
      ].join('\n'),
      environmentCommand,
      primaryCommand: `codex mcp add genfeed --url ${shellEndpoint} --bearer-token-env-var ${ENVIRONMENT_VARIABLE}`,
      verifyCommand: 'codex mcp list',
    };
  }

  return {
    authMethod,
    authorizationInstruction:
      'Configure your client with the scoped key, then verify the connection.',
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
