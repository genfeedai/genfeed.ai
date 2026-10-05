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

/**
 * A message the user pastes into a chat agent that builds its own connectors
 * from a remote MCP URL (Meta Muse, Grok Bot). The agent adds the server,
 * the user approves OAuth in the browser, and no secret enters the chat.
 */
export function buildConnectGenfeedChatPrompt(endpoint: string): string {
  const mcpEndpoint = normalizeEndpoint(endpoint);

  return [
    'Add Genfeed as a custom connector.',
    '',
    `MCP server URL: ${mcpEndpoint}`,
    'Transport: remote Streamable HTTP',
    'Authentication: OAuth. Send me the sign-in link and wait while I approve access in my browser. Never ask me for a password, token, or API key in this chat.',
    '',
    'After I approve, list my Genfeed brands to confirm the connection works. Before publishing anything, show me the draft and wait for my approval.',
  ].join('\n');
}

export function buildConnectGenfeedInstructions(
  client: ConnectGenfeedClient,
  endpoint: string,
  authMethod: ConnectGenfeedAuthMethod = 'oauth',
): ConnectGenfeedInstructions {
  const url = new URL(normalizeEndpoint(endpoint));
  const normalizedPath = url.pathname.replace(/\/+$/, '');
  const isClaude =
    client === 'claude-code' ||
    normalizedPath.toLowerCase().endsWith('/mcp/claude');
  if (isClaude) {
    url.pathname = normalizedPath.toLowerCase().endsWith('/mcp/claude')
      ? normalizedPath.replace(/\/mcp\/claude$/i, '/mcp/claude')
      : `${normalizedPath}/claude`;
    url.search = '';
    url.hash = '';
    authMethod = 'oauth';
  }
  const mcpEndpoint = isClaude ? url.toString() : normalizeEndpoint(endpoint);
  const shellEndpoint = /^[A-Za-z0-9:/._-]+$/.test(mcpEndpoint)
    ? mcpEndpoint
    : `'${mcpEndpoint.replace(/'/g, `'"'"'`)}'`;

  if (authMethod === 'oauth') {
    const authorizationInstruction =
      client === 'codex'
        ? 'Run codex mcp login genfeed if authorization did not open during setup. Sign in and approve access in your browser, then return to Codex.'
        : client === 'claude-code'
          ? 'Open /mcp inside Claude Code, select genfeed, and authenticate. Sign in and approve access in your browser, then return to Claude Code.'
          : `Add this endpoint as a remote Streamable HTTP server in your client, choose OAuth, and complete browser sign-in and consent.${isClaude ? ' The Claude connector requires OAuth; update your client if OAuth is unsupported.' : ' If your client does not support OAuth, use the advanced manual-key path.'}`;
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
