import process from 'node:process';
import { NodePtyAdapter } from './node-pty.adapter';
import type { PtySpawnOptions } from './pty-adapter.interface';

type ExitEvent = { exitCode: number; signal?: number };

class FakePty {
  readonly pid = 4242;
  dataHandlers = new Set<(data: string) => void>();
  exitHandlers = new Set<(event: ExitEvent) => void>();
  isKilled = false;
  size = { cols: 0, rows: 0 };
  written = '';

  constructor(
    readonly command: string,
    readonly args: string[],
    readonly options: Record<string, unknown>,
  ) {}

  emitData(data: string) {
    for (const handler of this.dataHandlers) handler(data);
  }

  emitExit(event: ExitEvent) {
    for (const handler of this.exitHandlers) handler(event);
  }

  kill() {
    this.isKilled = true;
  }

  onData(handler: (data: string) => void) {
    this.dataHandlers.add(handler);
    return { dispose: () => this.dataHandlers.delete(handler) };
  }

  onExit(handler: (event: ExitEvent) => void) {
    this.exitHandlers.add(handler);
    return { dispose: () => this.exitHandlers.delete(handler) };
  }

  resize(cols: number, rows: number) {
    this.size = { cols, rows };
  }

  write(data: string) {
    this.written += data;
  }
}

// The spawn-helper on a fake disk; undefined means the file is absent.
const world = vi.hoisted(() => ({
  helperMode: undefined as number | undefined,
  helperPath: undefined as string | undefined,
  ptys: [] as FakePty[],
}));

vi.mock('node:fs', () => {
  const isHelper = (file: string) => file.endsWith('spawn-helper');
  const fake = {
    chmodSync: (file: string, mode: number) => {
      world.helperPath = file;
      world.helperMode = mode;
    },
    existsSync: (file: string) =>
      isHelper(file) ? world.helperMode !== undefined : true,
    statSync: (file: string) => {
      if (!isHelper(file) || world.helperMode === undefined) {
        throw new Error(`ENOENT: ${file}`);
      }
      return { mode: world.helperMode };
    },
  };
  return { ...fake, default: fake };
});

vi.mock('node-pty', () => ({
  spawn: (
    command: string,
    args: string[],
    options: Record<string, unknown>,
  ) => {
    const pty = new FakePty(command, args, options);
    world.ptys.push(pty);
    return pty;
  },
}));

describe('NodePtyAdapter', () => {
  let adapter: NodePtyAdapter;

  const spawnOptions: PtySpawnOptions = {
    args: ['-l'],
    cols: 80,
    command: '/bin/bash',
    cwd: '/workspace',
    env: { NODE_ENV: 'test', TERM: 'xterm-256color' },
    kind: 'shell',
    name: 'xterm-256color',
    rows: 24,
  };

  beforeEach(() => {
    adapter = new NodePtyAdapter();
    world.helperMode = undefined;
    world.helperPath = undefined;
    world.ptys = [];
  });

  describe('ensureReady', () => {
    it('leaves the filesystem alone on win32', () => {
      world.helperMode = 0o644;
      const platformSpy = vi
        .spyOn(process, 'platform', 'get')
        .mockReturnValue('win32');

      adapter.ensureReady();
      platformSpy.mockRestore();

      expect(world.helperMode).toBe(0o644);
    });

    it('returns when the spawn-helper does not exist', () => {
      expect(() => adapter.ensureReady()).not.toThrow();
      expect(world.helperMode).toBeUndefined();
    });

    it('leaves an already-executable spawn-helper untouched', () => {
      world.helperMode = 0o750;

      adapter.ensureReady();

      expect(world.helperMode).toBe(0o750);
      expect(world.helperPath).toBeUndefined();
    });

    it('marks a non-executable spawn-helper as executable', () => {
      world.helperMode = 0o644;

      adapter.ensureReady();

      expect(world.helperMode).toBe(0o755);
      expect(world.helperPath).toContain(
        `prebuilds/${process.platform}-${process.arch}/spawn-helper`,
      );
    });
  });

  describe('spawn', () => {
    it('spawns a pty with the given options', () => {
      adapter.spawn(spawnOptions);

      expect(world.ptys).toEqual([
        expect.objectContaining({
          args: ['-l'],
          command: '/bin/bash',
          options: {
            cols: 80,
            cwd: '/workspace',
            env: { NODE_ENV: 'test', TERM: 'xterm-256color' },
            name: 'xterm-256color',
            rows: 24,
          },
        }),
      ]);
    });

    it('exposes the pty pid', () => {
      const handle = adapter.spawn(spawnOptions);

      expect(handle.pid).toBe(4242);
    });

    it('drives kill, resize, and write on the pty', () => {
      const handle = adapter.spawn(spawnOptions);

      handle.kill();
      handle.resize(100, 40);
      handle.write('ls\n');

      expect(world.ptys[0]).toMatchObject({
        isKilled: true,
        size: { cols: 100, rows: 40 },
        written: 'ls\n',
      });
    });

    it('delivers pty data and exit to subscribers until they dispose', () => {
      const handle = adapter.spawn(spawnOptions);
      const pty = world.ptys[0];
      const received: unknown[] = [];

      const dataSubscription = handle.onData((data) => received.push(data));
      const exitSubscription = handle.onExit((event) => received.push(event));
      pty.emitData('hello');
      dataSubscription.dispose();
      pty.emitData('after dispose');
      pty.emitExit({ exitCode: 0 });
      exitSubscription.dispose();
      pty.emitExit({ exitCode: 1 });

      expect(received).toEqual(['hello', { exitCode: 0 }]);
    });
  });
});
