import { spawn } from 'node:child_process';
import {
  buildDirectEnvironment,
  isPortlessService,
  type PortlessService,
} from './portless-env';

const ARGUMENT_SEPARATOR = '--';

interface ParsedArguments {
  command: string[];
  currentService: PortlessService;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArguments(): ParsedArguments {
  const args = process.argv.slice(2);
  const currentService = args.shift();

  if (!currentService || !isPortlessService(currentService)) {
    return fail(
      'Expected a direct service: app, api, docs, files, mcp, notifications, or website.',
    );
  }

  if (args.shift() !== ARGUMENT_SEPARATOR || args.length === 0) {
    return fail(
      'Usage: bun run scripts/dev/run-direct.ts <service> -- <command> [...args]',
    );
  }

  return { command: args, currentService };
}

function run(
  command: string[],
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  const executable = command[0];
  if (!executable) {
    return Promise.reject(new Error('Cannot run an empty command.'));
  }

  const child = spawn(executable, command.slice(1), {
    env: environment,
    stdio: 'inherit',
  });

  const forwardInterrupt = (): void => {
    child.kill('SIGINT');
  };
  const forwardTermination = (): void => {
    child.kill('SIGTERM');
  };

  process.once('SIGINT', forwardInterrupt);
  process.once('SIGTERM', forwardTermination);

  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      process.off('SIGINT', forwardInterrupt);
      process.off('SIGTERM', forwardTermination);
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

async function main(): Promise<void> {
  const { command, currentService } = parseArguments();
  const environment = process.env.PORTLESS_URL
    ? process.env
    : {
        ...process.env,
        ...buildDirectEnvironment({
          currentService,
          existingEnv: process.env,
        }),
      };

  process.exit(await run(command, environment));
}

await main();
