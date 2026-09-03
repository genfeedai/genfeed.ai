import {
  buildDirectEnvironment,
  isPortlessService,
  type PortlessService,
  sanitizeNodeColorEnvironment,
} from './portless-env';
import { runDetachedCommand } from './terminate-child-tree';

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
      'Expected a service: app, api, docs, files, mcp, notifications, or website.',
    );
  }

  if (args.shift() !== ARGUMENT_SEPARATOR || args.length === 0) {
    return fail(
      'Usage: bun run scripts/dev/run-service.ts <service> -- <command> [...args]',
    );
  }

  return { command: args, currentService };
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

  process.exit(
    await runDetachedCommand(
      command,
      sanitizeNodeColorEnvironment(environment),
    ),
  );
}

await main();
