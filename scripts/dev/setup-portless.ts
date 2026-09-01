import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { PORTLESS_PROXY_ENVIRONMENT } from './portless-env';

const PORTLESS_CLI_PATH = path.resolve(
  import.meta.dirname,
  '../../node_modules/.bin/portless',
);

export const PORTLESS_SERVICE_INSTALL_ARGS = [
  'service',
  'install',
  '--https',
  '--port',
  '443',
  '--tld',
  'localhost',
] as const;

const REQUIRED_STATUS_PATTERNS = [
  /^\s*Manager state:\s+running\s*$/mu,
  /^\s*Installed:\s+yes\s*$/mu,
  /^\s*Proxy on 443:\s+responding\s*$/mu,
  /^\s*HTTPS:\s+yes\s*$/mu,
  /^\s*TLDs:\s+\.localhost\s*$/mu,
  /^\s*LAN mode:\s+no\s*$/mu,
  /^\s*Wildcard:\s+no\s*$/mu,
] as const;

export function isPortlessServiceReady(statusOutput: string): boolean {
  return REQUIRED_STATUS_PATTERNS.every((pattern) =>
    pattern.test(statusOutput),
  );
}

export function shouldInstallPortlessService(
  statusOutput: string | null,
): boolean {
  return !statusOutput || !isPortlessServiceReady(statusOutput);
}

export function buildPortlessCommand(
  args: readonly string[],
  nodeExecutable = 'node',
  portlessCliPath = PORTLESS_CLI_PATH,
): string[] {
  return [nodeExecutable, portlessCliPath, ...args];
}

export async function waitForPortlessServiceReady(
  readStatus: () => string | null,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  attempts = 20,
  delayMilliseconds = 500,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = readStatus();
    if (status && isPortlessServiceReady(status)) {
      return true;
    }
    if (attempt < attempts - 1) {
      await sleep(delayMilliseconds);
    }
  }

  return false;
}

function readServiceStatus(): string | null {
  const [executable, ...args] = buildPortlessCommand(['service', 'status']);
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  if (result.error) {
    throw result.error;
  }

  return result.status === 0 ? result.stdout : null;
}

function installService(): void {
  const stateDirectory =
    process.env.PORTLESS_STATE_DIR ?? path.join(homedir(), '.portless');
  const [executable, ...args] = buildPortlessCommand([
    ...PORTLESS_SERVICE_INSTALL_ARGS,
    '--state-dir',
    stateDirectory,
  ]);
  const result = spawnSync(executable, args, {
    env: {
      ...process.env,
      ...PORTLESS_PROXY_ENVIRONMENT,
      PORTLESS_STATE_DIR: stateDirectory,
    },
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main(): Promise<void> {
  const currentStatus = readServiceStatus();

  if (process.argv.includes('--check')) {
    if (shouldInstallPortlessService(currentStatus)) {
      console.error(
        'Portless does not match the required local HTTPS contract. Run `bun run dev:setup`.',
      );
      process.exit(1);
    }

    console.log(
      'Portless is ready: HTTPS on 443 with .localhost routes and no LAN exposure.',
    );
    return;
  }

  if (!shouldInstallPortlessService(currentStatus)) {
    console.log(
      'Portless is already ready: HTTPS on 443 with .localhost routes and no LAN exposure.',
    );
    return;
  }

  console.log(
    'Applying the Portless HTTPS startup-service configuration. Administrator approval may be required.',
  );
  installService();

  if (!(await waitForPortlessServiceReady(readServiceStatus))) {
    console.error(
      'Portless service installation completed without the required HTTPS configuration.',
    );
    process.exit(1);
  }

  console.log(
    'Portless is ready: HTTPS on 443 with .localhost routes and no hosts-file synchronization.',
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
