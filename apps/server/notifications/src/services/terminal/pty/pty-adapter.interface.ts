import type { TerminalSessionKind } from '../terminal.types';

/** A disposable subscription returned by onData / onExit. */
export interface IPtySubscription {
  dispose(): void;
}

/** Handle to a running pty process. */
export interface IPtyHandle {
  readonly pid: number;
  kill(): void;
  onData(handler: (data: string) => void): IPtySubscription;
  onExit(
    handler: (event: { exitCode: number; signal?: number }) => void,
  ): IPtySubscription;
  resize(cols: number, rows: number): void;
  write(data: string): void;
}

export interface PtySpawnOptions {
  args: string[];
  cols: number;
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  kind: TerminalSessionKind;
  name: string;
  rows: number;
}

/** Abstraction over the native pty spawn implementation. */
export interface IPtyAdapter {
  /** Called once before spawn to ensure the pty helper binary is executable. */
  ensureReady(): void;
  spawn(opts: PtySpawnOptions): IPtyHandle;
}

export const PTY_ADAPTER = Symbol('PTY_ADAPTER');
