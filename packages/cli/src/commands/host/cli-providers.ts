import path from 'node:path';
import type { CliProviderDefinition } from './catalog';

/**
 * Text from a third party (a post being replied to) reaches these CLIs as
 * their prompt, so each runs with the least power its flags allow: no shell,
 * file or MCP tools where the CLI can switch them off, and an empty scratch
 * directory as its working root. The prompt fences the text as data as well,
 * but the flags do not rely on the model obeying that.
 */
const EDITOR_ROLE =
  'You are a text editor inside a social media tool. Answer with only the requested text. Do not use tools, read files or run commands.';

/** A server name no configuration uses, so the MCP allowlist is empty in effect. */
const NO_MCP_SERVER = 'genfeed-host-no-mcp';

export interface CliInvocation {
  args: string[];
  /** File the CLI writes its answer to, when it does not print it. */
  outputFile?: string;
}

/**
 * How each CLI is run for one non-interactive generation. The prompt always
 * goes on stdin; argv carries only fixed flags.
 */
export function buildCliInvocation(
  provider: CliProviderDefinition,
  scratchDirectory: string
): CliInvocation {
  switch (provider.id) {
    case 'claude-cli':
      return {
        args: [
          '-p',
          '--output-format',
          'text',
          '--tools',
          '',
          '--no-session-persistence',
          '--disable-slash-commands',
          '--strict-mcp-config',
          '--system-prompt',
          EDITOR_ROLE,
        ],
      };
    case 'codex-cli': {
      const outputFile = path.join(scratchDirectory, 'answer.txt');
      return {
        args: [
          'exec',
          '--sandbox',
          'read-only',
          '--skip-git-repo-check',
          '--ephemeral',
          // No user MCP servers, profiles or exec-policy rules; sign-in still uses CODEX_HOME.
          '--ignore-user-config',
          '--ignore-rules',
          // Feature keys a version does not know are ignored, so these hold across versions.
          '-c',
          'features.shell_tool=false',
          '-c',
          'features.plugins=false',
          '-c',
          'features.hooks=false',
          '-c',
          'features.apps=false',
          '-c',
          'features.browser_use=false',
          '-c',
          'features.computer_use=false',
          '-c',
          'web_search="disabled"',
          '--color',
          'never',
          '--output-last-message',
          outputFile,
          '-',
        ],
        outputFile,
      };
    }
    case 'gemini-cli':
      // Gemini's file tools stay inside the working directory (the empty scratch
      // directory) and tools that need approval are refused in headless mode; the
      // flags pin that approval mode and allow no MCP server.
      return {
        args: [
          '--approval-mode',
          'default',
          '--allowed-mcp-server-names',
          NO_MCP_SERVER,
          '--prompt',
          `${EDITOR_ROLE} The task is on stdin.`,
        ],
      };
  }
}
