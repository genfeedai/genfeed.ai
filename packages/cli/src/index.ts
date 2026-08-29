#!/usr/bin/env node
import { runLogin } from '@/commands/login';
import { createProgram, resolveLaunchMode } from '@/program';
import { runTerminalWorkspace } from '@/tui';
import { formatError } from '@/ui/theme';
import { setReplMode } from '@/utils/errors';

const program = createProgram();
program.exitOverride();

interface ExitCodeError extends Error {
  code: string;
}

function hasExitCode(error: unknown): error is ExitCodeError {
  return error instanceof Error && 'code' in error && typeof error.code === 'string';
}

async function startInteractiveWorkspace(): Promise<void> {
  while (true) {
    const action = await runTerminalWorkspace();
    if (action === 'exit') return;
    setReplMode(true);
    try {
      await runLogin({ intent: action });
    } catch {
      // runLogin already printed the normalized error; return to the workspace.
    } finally {
      setReplMode(false);
    }
  }
}

async function main(): Promise<void> {
  const mode = resolveLaunchMode({
    hasArguments: process.argv.length > 2,
    stdinIsTTY: process.stdin.isTTY === true,
    stdoutIsTTY: process.stdout.isTTY === true,
  });

  if (mode === 'help') {
    program.outputHelp();
    return;
  }

  if (mode === 'tui') {
    await startInteractiveWorkspace();
    return;
  }

  await program.parseAsync();
}

main().catch((error) => {
  if (hasExitCode(error)) {
    const { code } = error;
    if (code === 'commander.helpDisplayed' || code === 'commander.version') {
      process.exit(0);
    }
  }

  console.error(formatError(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
