import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { runDetachedCommand } from './terminate-child-tree';

const ARGUMENT_SEPARATOR = '--';

type PortlessClientEnvironmentOptions = {
  existingEnv: NodeJS.ProcessEnv;
  homeDirectory?: string;
  pathExists?: (candidate: string) => boolean;
};

export function buildPortlessClientEnvironment({
  existingEnv,
  homeDirectory = homedir(),
  pathExists = existsSync,
}: PortlessClientEnvironmentOptions): NodeJS.ProcessEnv {
  const configuredCaPath = existingEnv.NODE_EXTRA_CA_CERTS?.trim();
  if (configuredCaPath) {
    return existingEnv;
  }

  const stateDirectory =
    existingEnv.PORTLESS_STATE_DIR?.trim() ||
    path.join(homeDirectory, '.portless');
  const caPath = path.join(stateDirectory, 'ca.pem');

  if (!pathExists(caPath)) {
    throw new Error(
      `Portless CA not found at ${caPath}. Run \`bun run dev:setup\` before starting local services.`,
    );
  }

  return {
    ...existingEnv,
    NODE_EXTRA_CA_CERTS: caPath,
  };
}

export function parsePortlessClientCommand(args: string[]): string[] {
  const command = args[0] === ARGUMENT_SEPARATOR ? args.slice(1) : [...args];
  if (command.length === 0) {
    throw new Error(
      'Usage: bun run scripts/dev/run-portless-client.ts [--] <command> [...args]',
    );
  }
  return command;
}

async function main(): Promise<void> {
  const exitCode = await runDetachedCommand(
    parsePortlessClientCommand(process.argv.slice(2)),
    buildPortlessClientEnvironment({ existingEnv: process.env }),
  );
  process.exit(exitCode);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
