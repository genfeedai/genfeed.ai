import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { PORTLESS_PROXY_ENVIRONMENT } from './portless-env';

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

function readServiceStatus(): string | null {
  const result = spawnSync('portless', ['service', 'status'], {
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
  const result = spawnSync(
    'portless',
    [...PORTLESS_SERVICE_INSTALL_ARGS, '--state-dir', stateDirectory],
    {
      env: {
        ...process.env,
        ...PORTLESS_PROXY_ENVIRONMENT,
        PORTLESS_STATE_DIR: stateDirectory,
      },
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main(): void {
  if (process.argv.includes('--check')) {
    const currentStatus = readServiceStatus();
    if (!currentStatus || !isPortlessServiceReady(currentStatus)) {
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

  console.log(
    'Applying the Portless HTTPS startup-service configuration. Administrator approval may be required.',
  );
  installService();

  const installedStatus = readServiceStatus();
  if (!installedStatus || !isPortlessServiceReady(installedStatus)) {
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
  main();
}
