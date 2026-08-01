import { EventEmitter } from 'node:events';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

type ConsoleOutputErrorHandlerModule =
  typeof import('@libs/logger/console-output-error-handler');

class PeerOutputStream extends EventEmitter {
  private isPeerClosed = false;

  closePeer(): void {
    this.isPeerClosed = true;
  }

  write(): boolean {
    if (!this.isPeerClosed) {
      return true;
    }

    const error = Object.assign(new Error('write EPIPE'), {
      code: 'EPIPE',
      syscall: 'write',
    });
    this.emit('error', error);
    return false;
  }
}

describe('attachConsoleOutputErrorHandlers', () => {
  let attachConsoleOutputErrorHandlers: ConsoleOutputErrorHandlerModule['attachConsoleOutputErrorHandlers'];
  let Sentry: typeof import('@sentry/nestjs');

  beforeAll(async () => {
    ({ attachConsoleOutputErrorHandlers } = await import(
      '@libs/logger/console-output-error-handler'
    ));
    Sentry = await import('@sentry/nestjs');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('absorbs EPIPE and stops writes after the output peer closes', () => {
    const stdout = new PeerOutputStream();
    const stderr = new PeerOutputStream();
    const transport = { silent: false };

    attachConsoleOutputErrorHandlers(transport, stdout, stderr);

    stdout.closePeer();
    stdout.write();

    expect(transport.silent).toBe(true);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports unexpected output failures with operation and process context', () => {
    const stdout = new PeerOutputStream();
    const stderr = new PeerOutputStream();
    const transport = { silent: false };
    const error = Object.assign(new Error('socket reset'), {
      code: 'ECONNRESET',
    });

    attachConsoleOutputErrorHandlers(transport, stdout, stderr);
    stderr.emit('error', error);

    expect(transport.silent).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        cause: error,
        message: expect.stringContaining('stderr write failed'),
      }),
      {
        contexts: {
          logger_output: {
            operation: 'write',
            processId: process.pid,
            service: process.env.SERVICE_NAME ?? 'unknown',
            stream: 'stderr',
          },
        },
        level: 'error',
        tags: {
          'logger.operation': 'write',
          'logger.service': process.env.SERVICE_NAME ?? 'unknown',
          'logger.stream': 'stderr',
        },
      },
    );
  });

  it('detaches both stream handlers during logger shutdown', () => {
    const stdout = new PeerOutputStream();
    const stderr = new PeerOutputStream();
    const detach = attachConsoleOutputErrorHandlers(
      { silent: false },
      stdout,
      stderr,
    );

    expect(stdout.listenerCount('error')).toBe(1);
    expect(stderr.listenerCount('error')).toBe(1);

    detach();

    expect(stdout.listenerCount('error')).toBe(0);
    expect(stderr.listenerCount('error')).toBe(0);
  });
});
