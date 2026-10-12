import path from 'node:path';
import type { CliProviderDefinition } from './catalog';

const EDITOR_ROLE =
  'You are a text editor inside a social media tool. Answer with only the requested text. Do not use tools, read files or run commands.';

export interface CliInvocation {
  args: string[];
  /** File the CLI writes its answer to, when it does not print it. */
  outputFile?: string;
}

/**
 * How each CLI is run for one non-interactive, tool-free generation. The
 * prompt always goes on stdin; argv carries only fixed flags.
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
      return {
        args: ['--prompt', `${EDITOR_ROLE} The task is on stdin.`],
      };
  }
}
