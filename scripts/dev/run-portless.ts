import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildPortlessEnvironment,
  isPortlessService,
  type PortlessService,
} from './portless-env';

const INNER_FLAG = '--portless-inner';
const ARGUMENT_SEPARATOR = '--';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArguments(): {
  command: string[];
  currentService: PortlessService;
  inner: boolean;
} {
  const args = process.argv.slice(2);
  const inner = args[0] === INNER_FLAG;
  if (inner) {
    args.shift();
  }
  const currentService = args.shift();

  if (!currentService || !isPortlessService(currentService)) {
    return fail(
      `Expected a Portless service: app, api, docs, files, mcp, notifications, or website.`,
    );
  }

  if (args.shift() !== ARGUMENT_SEPARATOR || args.length === 0) {
    return fail(
      `Usage: bun run scripts/dev/run-portless.ts <service> -- <command> [...args]`,
    );
  }

  return { command: args, currentService, inner };
}

function run(
  command: string[],
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  const executable = command[0];
  if (!executable) {
    return Promise.reject(new Error('Cannot run an empty command.'));
  }
  const args = command.slice(1);
  const child = spawn(executable, args, {
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
  const { command, currentService, inner } = parseArguments();

  if (!inner) {
    const scriptPath = fileURLToPath(import.meta.url);
    const exitCode = await run(
      [
        'portless',
        'run',
        '--name',
        `${currentService}.genfeed`,
        process.execPath,
        scriptPath,
        INNER_FLAG,
        currentService,
        ARGUMENT_SEPARATOR,
        ...command,
      ],
      {
        ...process.env,
        PORTLESS_HTTPS: '0',
        PORTLESS_PORT: '1355',
        PORTLESS_SYNC_HOSTS: '0',
        PORTLESS_TLD: 'localhost',
      },
    );
    process.exit(exitCode);
  }

  const portlessUrl = process.env.PORTLESS_URL;
  if (!portlessUrl) {
    return fail('Portless did not provide PORTLESS_URL to the child process.');
  }

  const exitCode = await run(command, {
    ...process.env,
    ...buildPortlessEnvironment({
      currentService,
      existingEnv: process.env,
      portlessUrl,
    }),
  });
  process.exit(exitCode);
}

await main();
