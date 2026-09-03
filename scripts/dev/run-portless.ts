import { fileURLToPath } from 'node:url';
import {
  buildPortlessEnvironment,
  isPortlessService,
  PORTLESS_PROXY_ENVIRONMENT,
  type PortlessService,
  sanitizeNodeColorEnvironment,
} from './portless-env';
import {
  pruneStalePortlessSessions,
  shouldPruneBeforePortlessRun,
} from './prune-stale-portless';
import { runDetachedCommand } from './terminate-child-tree';

const INNER_FLAG = '--portless-inner';
const ARGUMENT_SEPARATOR = '--';

interface ParsedArguments {
  command: string[];
  currentService: PortlessService;
  isInner: boolean;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArguments(): ParsedArguments {
  const args = process.argv.slice(2);
  const isInner = args[0] === INNER_FLAG;
  if (isInner) {
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

  return { command: args, currentService, isInner };
}

async function main(): Promise<void> {
  const { command, currentService, isInner } = parseArguments();

  if (shouldPruneBeforePortlessRun(isInner)) {
    pruneStalePortlessSessions();
  }

  if (!isInner) {
    const scriptPath = fileURLToPath(import.meta.url);
    const exitCode = await runDetachedCommand(
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
      sanitizeNodeColorEnvironment({
        ...process.env,
        ...PORTLESS_PROXY_ENVIRONMENT,
      }),
    );
    process.exit(exitCode);
  }

  const portlessUrl = process.env.PORTLESS_URL;
  if (!portlessUrl) {
    return fail('Portless did not provide PORTLESS_URL to the child process.');
  }

  const exitCode = await runDetachedCommand(
    command,
    sanitizeNodeColorEnvironment({
      ...process.env,
      ...buildPortlessEnvironment({
        currentService,
        existingEnv: process.env,
        portlessUrl,
      }),
    }),
  );
  process.exit(exitCode);
}

await main();
