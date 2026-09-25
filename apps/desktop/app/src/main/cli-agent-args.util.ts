import fs from 'node:fs';
import path from 'node:path';
import {
  GENFEED_MCP_SERVER_NAME,
  GENFEED_MCP_TOKEN_ENV_VAR,
} from './cli-agent-runtime.constants';

export interface ClaudeCliArgsInput {
  mcpConfigPath: string;
  resumeSessionId: string | null;
  systemPrompt: string;
}

/**
 * `claude -p` reading the prompt from stdin. Built-in tools are removed
 * (`--tools ""`), only the Genfeed MCP server is loaded, and only its tools
 * are pre-approved. Nothing here bypasses permissions.
 */
export function buildClaudeCliArgs(input: ClaudeCliArgsInput): string[] {
  return [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--mcp-config',
    input.mcpConfigPath,
    '--strict-mcp-config',
    '--allowedTools',
    `mcp__${GENFEED_MCP_SERVER_NAME}`,
    '--tools',
    '',
    '--append-system-prompt',
    input.systemPrompt,
    ...(input.resumeSessionId ? ['--resume', input.resumeSessionId] : []),
  ];
}

export interface CodexCliArgsInput {
  mcpEndpoint: string;
  resumeSessionId: string | null;
}

/** TOML basic string; JSON string escaping is a valid subset for URLs. */
function toTomlString(value: string): string {
  return JSON.stringify(value);
}

/**
 * `codex exec --json` reading the prompt from stdin (`-`). The Genfeed MCP
 * server is configured inline with `-c` and authenticates through an env var
 * holding the `gf_` key, so no credential is written to disk. The sandbox is
 * read-only and approvals never escalate.
 */
export function buildCodexCliArgs(input: CodexCliArgsInput): string[] {
  const server = `mcp_servers.${GENFEED_MCP_SERVER_NAME}`;
  const options = [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '-c',
    'approval_policy="never"',
    '-c',
    `${server}.url=${toTomlString(input.mcpEndpoint)}`,
    '-c',
    `${server}.bearer_token_env_var=${toTomlString(GENFEED_MCP_TOKEN_ENV_VAR)}`,
    // Codex releases before native Streamable HTTP support need the rmcp client.
    '-c',
    'experimental_use_rmcp_client=true',
  ];

  return input.resumeSessionId
    ? [...options, 'resume', input.resumeSessionId, '-']
    : [...options, '-'];
}

export interface ClaudeMcpConfigFile {
  cleanup: () => void;
  path: string;
}

/**
 * Claude Code reads MCP headers from a config file. The file holds the `gf_`
 * key, so it lives in a private (0700) directory, is written 0600, and is
 * removed as soon as the turn ends.
 */
export function writeClaudeMcpConfig(params: {
  directory: string;
  mcpEndpoint: string;
  token: string;
  turnId: string;
}): ClaudeMcpConfigFile {
  fs.mkdirSync(params.directory, { mode: 0o700, recursive: true });
  fs.chmodSync(params.directory, 0o700);

  const filePath = path.join(params.directory, `mcp-${params.turnId}.json`);
  const config = {
    mcpServers: {
      [GENFEED_MCP_SERVER_NAME]: {
        headers: { Authorization: `Bearer ${params.token}` },
        type: 'http',
        url: params.mcpEndpoint,
      },
    },
  };

  fs.writeFileSync(filePath, JSON.stringify(config), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  fs.chmodSync(filePath, 0o600);

  return {
    cleanup: () => {
      fs.rmSync(filePath, { force: true });
    },
    path: filePath,
  };
}

/** Removes MCP config files left behind by a crash of a previous run. */
export function removeStaleClaudeMcpConfigs(directory: string): void {
  if (!fs.existsSync(directory)) {
    return;
  }

  for (const entry of fs.readdirSync(directory)) {
    if (entry.startsWith('mcp-') && entry.endsWith('.json')) {
      fs.rmSync(path.join(directory, entry), { force: true });
    }
  }
}
