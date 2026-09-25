import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildClaudeCliArgs,
  buildCodexCliArgs,
  removeStaleClaudeMcpConfigs,
  writeClaudeMcpConfig,
} from './cli-agent-args.util';

const TOKEN = 'gf_live_desktop_secret_key';
const temporaryDirectories: string[] = [];

function makeTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genfeed-cli-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('buildClaudeCliArgs', () => {
  it('runs headless stream-json with only the Genfeed MCP tools approved', () => {
    const args = buildClaudeCliArgs({
      mcpConfigPath: '/tmp/mcp.json',
      resumeSessionId: null,
      systemPrompt: 'You are the Genfeed agent.',
    });

    expect(args.slice(0, 5)).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
    ]);
    expect(args[args.indexOf('--mcp-config') + 1]).toBe('/tmp/mcp.json');
    expect(args).toContain('--strict-mcp-config');
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('mcp__genfeed');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe(
      'You are the Genfeed agent.',
    );
    expect(args).not.toContain('--resume');
    expect(args).not.toContain('--dangerously-skip-permissions');
    expect(args.join(' ')).not.toContain('gf_');
  });

  it('resumes the stored Claude session', () => {
    const args = buildClaudeCliArgs({
      mcpConfigPath: '/tmp/mcp.json',
      resumeSessionId: 'session-1',
      systemPrompt: 'x',
    });

    expect(args.slice(-2)).toEqual(['--resume', 'session-1']);
  });
});

describe('buildCodexCliArgs', () => {
  it('configures the MCP server inline without putting the key on argv', () => {
    const args = buildCodexCliArgs({
      mcpEndpoint: 'https://mcp.genfeed.ai/mcp',
      resumeSessionId: null,
    });

    expect(args.slice(0, 5)).toEqual([
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
    ]);
    expect(args).toContain(
      'mcp_servers.genfeed.url="https://mcp.genfeed.ai/mcp"',
    );
    expect(args).toContain(
      'mcp_servers.genfeed.bearer_token_env_var="GENFEED_API_KEY"',
    );
    expect(args).toContain('approval_policy="never"');
    expect(args.at(-1)).toBe('-');
    expect(args).not.toContain('resume');
    expect(args.join(' ')).not.toContain('gf_');
    expect(args.join(' ')).not.toContain('dangerously');
  });

  it('resumes a Codex session reading the prompt from stdin', () => {
    const args = buildCodexCliArgs({
      mcpEndpoint: 'http://localhost:3014/mcp',
      resumeSessionId: 'thread-9',
    });

    expect(args.slice(-3)).toEqual(['resume', 'thread-9', '-']);
    expect(args.indexOf('--json')).toBeLessThan(args.indexOf('resume'));
  });
});

describe('writeClaudeMcpConfig', () => {
  it('writes a private 0600 file in a 0700 directory and cleans it up', () => {
    const directory = path.join(makeTemporaryDirectory(), 'mcp');
    const config = writeClaudeMcpConfig({
      directory,
      mcpEndpoint: 'https://mcp.genfeed.ai/mcp',
      token: TOKEN,
      turnId: 'turn-12345678',
    });

    expect(fs.statSync(directory).mode & 0o777).toBe(0o700);
    expect(fs.statSync(config.path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(fs.readFileSync(config.path, 'utf8'))).toEqual({
      mcpServers: {
        genfeed: {
          headers: { Authorization: `Bearer ${TOKEN}` },
          type: 'http',
          url: 'https://mcp.genfeed.ai/mcp',
        },
      },
    });

    config.cleanup();
    expect(fs.existsSync(config.path)).toBe(false);
  });

  it('refuses to overwrite an existing file for the same turn', () => {
    const directory = makeTemporaryDirectory();
    const params = {
      directory,
      mcpEndpoint: 'https://mcp.genfeed.ai/mcp',
      token: TOKEN,
      turnId: 'turn-12345678',
    };

    writeClaudeMcpConfig(params);
    expect(() => writeClaudeMcpConfig(params)).toThrow();
  });

  it('sweeps stale configs left by a crash', () => {
    const directory = makeTemporaryDirectory();
    fs.writeFileSync(path.join(directory, 'mcp-old.json'), '{}');
    fs.writeFileSync(path.join(directory, 'keep.txt'), 'x');

    removeStaleClaudeMcpConfigs(directory);

    expect(fs.readdirSync(directory)).toEqual(['keep.txt']);
  });
});
