import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HostFailure } from './failure';

const MAX_OUTPUT_BYTES = 262_144;
const KILL_GRACE_MS = 2_000;

export interface CliRunOptions {
  /** Aborts the run, for example when the browser closes the pipe. */
  abortSignal?: AbortSignal;
  args: readonly string[];
  env: NodeJS.ProcessEnv;
  executablePath: string;
  /** Read after exit instead of stdout, for CLIs that write their answer to a file. */
  outputFile?: string;
  /** The prompt, sent on stdin. User text is never part of argv or a shell command. */
  prompt: string;
  timeoutMs: number;
  workingDirectory: string;
}

function terminate(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try {
    // The child leads its own process group, so its helpers die with it.
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Already gone.
    }
  }
}

/**
 * Runs one local AI CLI to completion and returns its answer. The child gets
 * the prompt on stdin, runs in an empty directory, is stopped at the timeout
 * (SIGTERM, then SIGKILL) and never outlives the run.
 */
export async function runCli(options: CliRunOptions): Promise<string> {
  const child = spawn(options.executablePath, [...options.args], {
    cwd: options.workingDirectory,
    detached: true,
    env: options.env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const stdout: Buffer[] = [];
  let stdoutBytes = 0;
  let failure: HostFailure | null = null;
  let killTimer: NodeJS.Timeout | undefined;

  const stop = (reason: HostFailure): void => {
    if (failure) return;
    failure = reason;
    terminate(child.pid, 'SIGTERM');
    killTimer = setTimeout(() => terminate(child.pid, 'SIGKILL'), KILL_GRACE_MS);
    killTimer.unref();
  };

  const timeout = setTimeout(
    () => stop(new HostFailure('provider_timeout', 'The local provider took too long to answer.')),
    options.timeoutMs
  );
  const onAbort = (): void =>
    stop(new HostFailure('internal_error', 'The request was cancelled by the browser.'));
  if (options.abortSignal?.aborted) onAbort();
  options.abortSignal?.addEventListener('abort', onAbort, { once: true });

  child.stdout.on('data', (chunk: Buffer) => {
    stdoutBytes += chunk.byteLength;
    if (stdoutBytes > MAX_OUTPUT_BYTES) {
      stop(new HostFailure('provider_failed', 'The local provider returned too much text.'));
      return;
    }
    stdout.push(chunk);
  });
  child.stderr.resume();
  child.stdin.on('error', () => {
    // The CLI may exit before reading all of stdin; its exit code reports the outcome.
  });
  child.stdin.end(options.prompt);

  const exit = await new Promise<{ code: number | null; spawnError: NodeJS.ErrnoException | null }>(
    (resolve) => {
      child.once('error', (spawnError: NodeJS.ErrnoException) =>
        resolve({ code: null, spawnError })
      );
      child.once('close', (code) => resolve({ code, spawnError: null }));
    }
  );
  clearTimeout(timeout);
  options.abortSignal?.removeEventListener('abort', onAbort);
  // Anything still alive in the group after the leader exits is stopped too.
  terminate(child.pid, 'SIGKILL');
  if (killTimer) clearTimeout(killTimer);

  if (failure) throw failure;
  if (exit.spawnError) {
    throw new HostFailure('provider_unavailable', 'The local provider could not be started.');
  }
  if (exit.code !== 0) {
    throw new HostFailure('provider_failed', `The local provider exited with code ${exit.code}.`);
  }
  const answer = options.outputFile
    ? await readFile(options.outputFile, 'utf8').catch(() => '')
    : Buffer.concat(stdout).toString('utf8');
  if (!answer.trim()) {
    throw new HostFailure('provider_failed', 'The local provider returned nothing.');
  }
  return answer.trim();
}

/** A private empty directory for one run: the CLI starts with nothing of the user's to read. */
export async function withScratchDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'genfeed-host-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
