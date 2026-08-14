import { type ChildProcess, spawn } from 'node:child_process';

export const DETACHED_CHILD_SPAWN_OPTIONS = {
  detached: true,
  stdio: 'inherit',
} as const;

export const ORPHAN_PARENT_POLL_MS = 2_000;

type KillProcess = (target: number, signal: NodeJS.Signals) => void;

export function isOrphanedByInit(ppid: number): boolean {
  return ppid === 1;
}

export function terminateChildTree(
  pid: number | undefined,
  signal: NodeJS.Signals = 'SIGTERM',
  killProcess: KillProcess = (target, nextSignal) => {
    process.kill(target, nextSignal);
  },
): void {
  if (pid === undefined || pid <= 0) {
    return;
  }

  try {
    killProcess(-pid, signal);
  } catch {
    try {
      killProcess(pid, signal);
    } catch {
      // Child already exited.
    }
  }
}

export function runDetachedCommand(
  command: string[],
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  const executable = command[0];
  if (!executable) {
    return Promise.reject(new Error('Cannot run an empty command.'));
  }

  const child = spawn(executable, command.slice(1), {
    ...DETACHED_CHILD_SPAWN_OPTIONS,
    env: environment,
  });

  return attachChildLifecycle(child);
}

function attachChildLifecycle(child: ChildProcess): Promise<number> {
  const stop = (signal: NodeJS.Signals): void => {
    terminateChildTree(child.pid, signal);
  };
  const forwardInterrupt = (): void => {
    stop('SIGINT');
  };
  const forwardTermination = (): void => {
    stop('SIGTERM');
  };
  const orphanWatch = setInterval(() => {
    if (isOrphanedByInit(process.ppid)) {
      stop('SIGTERM');
      process.exit(1);
    }
  }, ORPHAN_PARENT_POLL_MS);

  process.once('SIGINT', forwardInterrupt);
  process.once('SIGTERM', forwardTermination);

  return new Promise((resolve, reject) => {
    child.once('error', (error) => {
      clearInterval(orphanWatch);
      process.off('SIGINT', forwardInterrupt);
      process.off('SIGTERM', forwardTermination);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearInterval(orphanWatch);
      process.off('SIGINT', forwardInterrupt);
      process.off('SIGTERM', forwardTermination);
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}
