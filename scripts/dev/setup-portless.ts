import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { PORTLESS_PROXY_ENVIRONMENT } from './portless-env';

const PORTLESS_CLI_PATH = path.resolve(
  import.meta.dirname,
  '../../node_modules/.bin/portless',
);

const PORTLESS_LAUNCH_DAEMON_LABEL = 'sh.portless.proxy';
export const PORTLESS_LAUNCH_DAEMON_PATH = `/Library/LaunchDaemons/${PORTLESS_LAUNCH_DAEMON_LABEL}.plist`;
const PLIST_BUDDY_PATH = '/usr/libexec/PlistBuddy';
const HOMEBREW_CELLAR_NODE_PATTERN =
  /^(?<prefix>.+)\/Cellar\/(?<formula>node(?:@[^/]+)?)\/[^/]+\/bin\/node$/u;

/** `launchctl print` exit status when launchd has no such job loaded. */
const LAUNCHCTL_SERVICE_NOT_FOUND = 113;

type ServiceCommandExpectation = 'any' | 'success' | 'unloaded';

type ServiceCommand = {
  args: string[];
  /** `unloaded` accepts only launchctl's not-found status, never other errors. */
  expect: ServiceCommandExpectation;
};

export type ServiceCommandOutcome = 'continue' | 'still-loaded' | 'failed';

export function evaluateServiceCommand(
  expect: ServiceCommandExpectation,
  status: number | null,
): ServiceCommandOutcome {
  if (expect === 'any') {
    return 'continue';
  }
  if (expect === 'success') {
    return status === 0 ? 'continue' : 'failed';
  }
  if (status === LAUNCHCTL_SERVICE_NOT_FOUND) {
    return 'continue';
  }
  return status === 0 ? 'still-loaded' : 'failed';
}

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

/**
 * Portless writes its LaunchDaemon with `process.execPath`, which resolves
 * Homebrew's symlinks to a versioned Cellar directory that `brew upgrade`
 * deletes (vercel-labs/portless#393). The formula's `opt` link follows upgrades.
 */
export function resolveStableNodePath(nodePath: string): string {
  const groups = HOMEBREW_CELLAR_NODE_PATTERN.exec(nodePath)?.groups;
  return groups ? `${groups.prefix}/opt/${groups.formula}/bin/node` : nodePath;
}

export function needsNodeRepin(
  pinnedNodePath: string | null,
  stableNodePath: string,
): boolean {
  return pinnedNodePath !== null && pinnedNodePath !== stableNodePath;
}

/** Reads `launchctl print-disabled system`, which prints `enabled`/`disabled` (older macOS: `false`/`true`). */
export function isServiceDisabled(
  printDisabledOutput: string,
  label = PORTLESS_LAUNCH_DAEMON_LABEL,
): boolean {
  const escapedLabel = label.replaceAll('.', '\\.');
  return new RegExp(
    `^\\s*"${escapedLabel}"\\s*=>\\s*(?:disabled|true)\\s*$`,
    'mu',
  ).test(printDisabledOutput);
}

export type PortlessSetupPlan = {
  /** A disabled override survives while the job runs, so a healthy service can still miss the next boot. */
  enable: boolean;
  install: boolean;
  repinTo: string | null;
};

export function planPortlessSetup(
  statusOutput: string | null,
  pinnedNodePath: string | null,
  serviceDisabled: boolean,
): PortlessSetupPlan {
  const stableNodePath =
    pinnedNodePath === null ? null : resolveStableNodePath(pinnedNodePath);

  return {
    enable: serviceDisabled,
    install: shouldInstallPortlessService(statusOutput),
    repinTo:
      stableNodePath !== null && needsNodeRepin(pinnedNodePath, stableNodePath)
        ? stableNodePath
        : null,
  };
}

export function buildServiceEnableCommand(): ServiceCommand {
  return {
    args: [
      'sudo',
      'launchctl',
      'enable',
      `system/${PORTLESS_LAUNCH_DAEMON_LABEL}`,
    ],
    expect: 'success',
  };
}

/**
 * Mirrors the reload sequence Portless uses when it installs the daemon, and
 * only edits the plist once launchd no longer has the job loaded. A later
 * failure is retried by the next setup run: an unloaded or unhealthy job is
 * reinstalled, and a disabled one is re-enabled.
 */
export function buildNodeRepinCommands(
  stableNodePath: string,
  plistPath = PORTLESS_LAUNCH_DAEMON_PATH,
): ServiceCommand[] {
  const serviceTarget = `system/${PORTLESS_LAUNCH_DAEMON_LABEL}`;

  return [
    {
      args: ['sudo', 'launchctl', 'bootout', 'system', plistPath],
      expect: 'any',
    },
    {
      // No sudo: a failed authentication must not read as an unloaded job.
      args: ['launchctl', 'print', serviceTarget],
      expect: 'unloaded',
    },
    {
      args: [
        'sudo',
        PLIST_BUDDY_PATH,
        '-c',
        `Set :ProgramArguments:0 ${stableNodePath}`,
        plistPath,
      ],
      expect: 'success',
    },
    {
      args: ['sudo', 'launchctl', 'bootstrap', 'system', plistPath],
      expect: 'success',
    },
    buildServiceEnableCommand(),
    {
      args: ['sudo', 'launchctl', 'kickstart', '-k', serviceTarget],
      expect: 'success',
    },
  ];
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

/** Returns null only when no startup service is installed. */
function readPinnedNodePath(): string | null {
  if (
    process.platform !== 'darwin' ||
    !existsSync(PORTLESS_LAUNCH_DAEMON_PATH)
  ) {
    return null;
  }

  const result = spawnSync(
    PLIST_BUDDY_PATH,
    ['-c', 'Print :ProgramArguments:0', PORTLESS_LAUNCH_DAEMON_PATH],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Could not read the Node path from ${PORTLESS_LAUNCH_DAEMON_PATH}.`,
    );
  }

  return result.stdout.trim();
}

function readServiceDisabled(): boolean {
  if (process.platform !== 'darwin') {
    return false;
  }

  const result = spawnSync('launchctl', ['print-disabled', 'system'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error('Could not read the launchd disabled-service list.');
  }

  return isServiceDisabled(result.stdout);
}

function runServiceCommands(commands: ServiceCommand[]): void {
  for (const { args, expect } of commands) {
    const [executable, ...commandArgs] = args;
    const result = spawnSync(executable, commandArgs, {
      stdio: expect === 'success' ? 'inherit' : ['inherit', 'ignore', 'ignore'],
    });

    if (result.error) {
      throw result.error;
    }

    const outcome = evaluateServiceCommand(expect, result.status);
    if (outcome === 'still-loaded') {
      console.error(
        'The Portless service is still loaded, so its Node path was left unchanged. Run `bun run dev:setup` again.',
      );
      process.exit(1);
    }
    if (outcome === 'failed') {
      console.error(
        `\`${args.join(' ')}\` failed, so the Portless service setup did not finish. Run \`bun run dev:setup\` again.`,
      );
      process.exit(result.status || 1);
    }
  }
}

async function main(): Promise<void> {
  const pinnedNodePath = readPinnedNodePath();
  const plan = planPortlessSetup(
    readServiceStatus(),
    pinnedNodePath,
    readServiceDisabled(),
  );

  if (process.argv.includes('--check')) {
    if (plan.install) {
      console.error(
        'Portless does not match the required local HTTPS contract. Run `bun run dev:setup`.',
      );
      process.exit(1);
    }
    if (plan.repinTo !== null) {
      console.error(
        `The Portless service runs ${pinnedNodePath}, which a Node upgrade can remove. Run \`bun run dev:setup\` to use ${plan.repinTo}.`,
      );
      process.exit(1);
    }
    if (plan.enable) {
      console.error(
        'The Portless service is disabled in launchd, so it will not start after a restart. Run `bun run dev:setup`.',
      );
      process.exit(1);
    }

    console.log(
      'Portless is ready: HTTPS on 443 with .localhost routes and no LAN exposure.',
    );
    return;
  }

  if (!plan.install && plan.repinTo === null && !plan.enable) {
    console.log(
      'Portless is already ready: HTTPS on 443 with .localhost routes and no LAN exposure.',
    );
    return;
  }

  if (plan.enable) {
    console.log(
      'Re-enabling the Portless service in launchd. Administrator approval may be required.',
    );
    runServiceCommands([buildServiceEnableCommand()]);
  }

  if (plan.install) {
    console.log(
      'Applying the Portless HTTPS startup-service configuration. Administrator approval may be required.',
    );
    installService();
  }

  const installedNodePath = readPinnedNodePath();
  if (installedNodePath !== null) {
    const installedStableNodePath = resolveStableNodePath(installedNodePath);
    if (needsNodeRepin(installedNodePath, installedStableNodePath)) {
      console.log(
        `Pointing the Portless service at ${installedStableNodePath} so Node upgrades keep it running. Administrator approval may be required.`,
      );
      runServiceCommands(buildNodeRepinCommands(installedStableNodePath));
    }
  }

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
