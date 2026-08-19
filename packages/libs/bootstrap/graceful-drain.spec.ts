import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drainHttpApplication, registerGracefulDrain } from './graceful-drain';

interface MockHttpServer {
  close: ReturnType<typeof vi.fn>;
}

function buildLogger() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
  };
}

describe('drainHttpApplication', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('closes HTTP, then the Nest app, then exits 0', async () => {
    const order: string[] = [];
    const httpServer: MockHttpServer = {
      close: vi.fn((callback?: (error?: Error) => void) => {
        order.push('http');
        callback?.();
      }),
    };
    const app = {
      close: vi.fn(async () => {
        order.push('app');
      }),
    };
    const logger = buildLogger();

    await drainHttpApplication({
      app,
      httpServer,
      logger,
      serviceName: 'files',
      signal: 'SIGTERM',
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'Received SIGTERM, shutting down files gracefully',
    );
    expect(order).toEqual(['http', 'app']);
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not exit until the HTTP server has finished closing', async () => {
    let finishClose: (() => void) | undefined;
    const httpServer: MockHttpServer = {
      close: vi.fn((callback?: (error?: Error) => void) => {
        finishClose = () => callback?.();
      }),
    };
    const app = { close: vi.fn().mockResolvedValue(undefined) };
    const logger = buildLogger();

    const drain = drainHttpApplication({
      app,
      httpServer,
      logger,
      serviceName: 'files',
      signal: 'SIGINT',
    });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(app.close).not.toHaveBeenCalled();

    finishClose?.();
    await drain;

    expect(app.close).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('treats an already-closed HTTP server as drained and still closes the app', async () => {
    const alreadyClosed = Object.assign(new Error('Server is not running'), {
      code: 'ERR_SERVER_NOT_RUNNING',
    });
    const httpServer: MockHttpServer = {
      close: vi.fn((callback?: (error?: Error) => void) => {
        callback?.(alreadyClosed);
      }),
    };
    const app = { close: vi.fn().mockResolvedValue(undefined) };
    const logger = buildLogger();

    await drainHttpApplication({
      app,
      httpServer,
      logger,
      serviceName: 'files',
      signal: 'SIGTERM',
    });

    expect(app.close).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs and exits 1 when HTTP close fails', async () => {
    const failure = new Error('socket hang');
    const httpServer: MockHttpServer = {
      close: vi.fn((callback?: (error?: Error) => void) => {
        callback?.(failure);
      }),
    };
    const app = { close: vi.fn().mockResolvedValue(undefined) };
    const logger = buildLogger();

    await drainHttpApplication({
      app,
      httpServer,
      logger,
      serviceName: 'files',
      signal: 'SIGTERM',
    });

    expect(app.close).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to shut down files gracefully',
      failure,
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs and exits 1 when app.close fails after HTTP drain', async () => {
    const failure = new Error('bullmq close failed');
    const httpServer: MockHttpServer = {
      close: vi.fn((callback?: (error?: Error) => void) => {
        callback?.();
      }),
    };
    const app = { close: vi.fn().mockRejectedValue(failure) };
    const logger = buildLogger();

    await drainHttpApplication({
      app,
      httpServer,
      logger,
      serviceName: 'files',
      signal: 'SIGTERM',
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to shut down files gracefully',
      failure,
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('treats a thrown already-closed HTTP server as drained', async () => {
    const alreadyClosed = Object.assign(new Error('Server is not running'), {
      code: 'ERR_SERVER_NOT_RUNNING',
    });
    const httpServer: MockHttpServer = {
      close: vi.fn(() => {
        throw alreadyClosed;
      }),
    };
    const app = { close: vi.fn().mockResolvedValue(undefined) };
    const logger = buildLogger();

    await drainHttpApplication({
      app,
      httpServer,
      logger,
      serviceName: 'files',
      signal: 'SIGTERM',
    });

    expect(app.close).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('stringifies non-Error shutdown failures', async () => {
    const httpServer: MockHttpServer = {
      close: vi.fn((callback?: (error?: Error) => void) => {
        callback?.();
      }),
    };
    const app = { close: vi.fn().mockRejectedValue('queue close failed') };
    const logger = buildLogger();

    await drainHttpApplication({
      app,
      httpServer,
      logger,
      serviceName: 'files',
      signal: 'SIGTERM',
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to shut down files gracefully',
      'queue close failed',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs and exits 1 when HTTP close throws a real error', async () => {
    const failure = new Error('close threw');
    const httpServer: MockHttpServer = {
      close: vi.fn(() => {
        throw failure;
      }),
    };
    const app = { close: vi.fn().mockResolvedValue(undefined) };
    const logger = buildLogger();

    await drainHttpApplication({
      app,
      httpServer,
      logger,
      serviceName: 'files',
      signal: 'SIGTERM',
    });

    expect(app.close).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to shut down files gracefully',
      failure,
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('registerGracefulDrain', () => {
  it('registers once-only SIGTERM/SIGINT handlers that drain then exit', async () => {
    const handlers = new Map<string, () => void>();
    const onceSpy = vi
      .spyOn(process, 'once')
      .mockImplementation((event: string | symbol, listener: unknown) => {
        handlers.set(String(event), listener as () => void);
        return process;
      });
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const httpServer: MockHttpServer = {
      close: vi.fn((callback?: (error?: Error) => void) => {
        callback?.();
      }),
    };
    const app = { close: vi.fn().mockResolvedValue(undefined) };
    const logger = buildLogger();

    registerGracefulDrain({
      app,
      httpServer,
      logger,
      serviceName: 'files',
    });

    expect(handlers.has('SIGTERM')).toBe(true);
    expect(handlers.has('SIGINT')).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();

    handlers.get('SIGTERM')?.();
    await vi.waitFor(() => {
      expect(app.close).toHaveBeenCalledOnce();
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    onceSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
