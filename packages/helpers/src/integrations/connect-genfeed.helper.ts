import type {
  ConnectGenfeedAuthMethod,
  ConnectGenfeedClient,
  ConnectGenfeedInstructions,
} from '@genfeedai/contracts/interfaces';

const ENVIRONMENT_VARIABLE = 'GENFEED_API_KEY';
export const GENFEED_SKILLS_INSTALL_COMMAND = 'npx skills add genfeedai/agent';

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

/** Setup instructions for a local agent with access to its client's configuration. */
export function buildGenfeedAgentSetupPrompt(
  endpoint: string,
  clientName = 'the local agent I am using',
): string {
  const mcpEndpoint = normalizeEndpoint(endpoint);
  const claude = buildConnectGenfeedInstructions('claude-code', mcpEndpoint);
  const codex = buildConnectGenfeedInstructions('codex', mcpEndpoint);

  return `Set up the Genfeed MCP server on this machine, with its agent playbook, for ${clientName}.

Endpoint: ${mcpEndpoint}
Authentication: browser OAuth (no API key required)
Setup reference: https://github.com/genfeedai/agent/blob/main/llms-install.md

Do this end to end:
1. Inspect the selected client's existing Genfeed plugins, skills, and MCP configuration. Preserve unrelated configuration and use the existing Genfeed installation when present. Set up only this client; ask which client to use if you cannot identify it.
2. Install the Genfeed playbook with ${GENFEED_SKILLS_INSTALL_COMMAND}. Select only the intended client in the installer. Skip this step if its installed Genfeed plugin already includes the playbook. Installing skills alone does not configure or authenticate MCP.
3. If Genfeed MCP is not already configured, add the remote Streamable HTTP server for the selected client using browser authorization:
   - Claude Code: ${claude.primaryCommand}
   - Codex: ${codex.primaryCommand}
   - Equivalent Codex user-level ~/.codex/config.toml:

${codex.configuration}

For other local clients, follow their supported remote MCP configuration using the endpoint above. Do not duplicate a server provided by an installed plugin.
4. ${claude.authorizationInstruction}
   ${codex.authorizationInstruction}
   For other clients, open their OAuth connection flow. Authenticate only the selected client.
5. Ask the user to complete consent in their browser. Never request tokens or passwords in this chat. If authorization is denied or expires, restart the client authorization flow.
6. Verify access with read-only get_account_info and list_brands calls (list my Genfeed brands). A copied command, registered plugin source, or server list entry alone does not verify authorization.
7. Do not generate content, schedule, publish, or resolve approvals during setup. Report skill installation, MCP configuration, and authenticated verification separately, including any remaining user step. If OAuth is unsupported, direct the user to Genfeed's guided setup for the advanced manual-key path.`;
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
