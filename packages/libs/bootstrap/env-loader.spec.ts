import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as dotenv from 'dotenv';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootstrap,
  setupGracefulShutdown,
  setupServiceShell,
} from './env-loader';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

describe('bootstrap', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalServiceName = process.env.SERVICE_NAME;
  const originalMaxListeners = EventEmitter.defaultMaxListeners;
  const originalProcessMaxListeners = process.getMaxListeners();

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SERVICE_NAME;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalServiceName === undefined) {
      delete process.env.SERVICE_NAME;
    } else {
      process.env.SERVICE_NAME = originalServiceName;
    }
    EventEmitter.defaultMaxListeners = originalMaxListeners;
    process.setMaxListeners(originalProcessMaxListeners);
  });

  it('loads production env files when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    vi.mocked(fs.existsSync).mockReturnValue(true);

    bootstrap({ app: 'api' });

    expect(vi.mocked(dotenv.config).mock.calls.map(([o]) => o?.path)).toEqual([
      'api/.env.production',
      '../../.env.production',
    ]);
  });

  it('loads staging env files when NODE_ENV is staging', () => {
    process.env.NODE_ENV = 'staging';
    vi.mocked(fs.existsSync).mockReturnValue(true);

    bootstrap({ app: 'files' });

    expect(vi.mocked(dotenv.config).mock.calls.map(([o]) => o?.path)).toEqual([
      'files/.env.staging',
      '../../.env.staging',
    ]);
  });

  it('loads test env files when NODE_ENV is test', () => {
    process.env.NODE_ENV = 'test';
    vi.mocked(fs.existsSync).mockReturnValue(true);

    bootstrap({ app: 'workers' });

    expect(vi.mocked(dotenv.config).mock.calls.map(([o]) => o?.path)).toEqual([
      'workers/.env.test',
      '../../.env.test',
    ]);
  });

  it('loads local development env files in priority order otherwise', () => {
    process.env.NODE_ENV = 'development';
    vi.mocked(fs.existsSync).mockReturnValue(true);

    bootstrap({ app: 'mcp' });

    expect(vi.mocked(dotenv.config).mock.calls.map(([o]) => o?.path)).toEqual([
      'mcp/.env.local',
      'mcp/.env',
      '../../.env.local',
      '../../.env',
    ]);
  });

  it('skips env files that do not exist', () => {
    process.env.NODE_ENV = 'development';
    vi.mocked(fs.existsSync).mockReturnValue(false);

    bootstrap({ app: 'api' });

    expect(dotenv.config).not.toHaveBeenCalled();
  });

  it('defaults SERVICE_NAME to the app name', () => {
    process.env.NODE_ENV = 'test';
    vi.mocked(fs.existsSync).mockReturnValue(false);

    bootstrap({ app: 'notifications' });

    expect(process.env.SERVICE_NAME).toBe('notifications');
  });

  it('keeps an explicitly configured SERVICE_NAME', () => {
    process.env.NODE_ENV = 'test';
    process.env.SERVICE_NAME = 'custom-label';
    vi.mocked(fs.existsSync).mockReturnValue(false);

    bootstrap({ app: 'api' });

    expect(process.env.SERVICE_NAME).toBe('custom-label');
  });

  it('raises the max listener limits', () => {
    process.env.NODE_ENV = 'test';
    vi.mocked(fs.existsSync).mockReturnValue(false);

    bootstrap({ app: 'api', maxListeners: 77 });

    expect(EventEmitter.defaultMaxListeners).toBe(77);
    expect(process.getMaxListeners()).toBe(77);
  });
});

describe('setupGracefulShutdown', () => {
  it('registers SIGTERM and SIGINT handlers that exit cleanly', () => {
    const handlers = new Map<string, () => void>();
    const onSpy = vi
      .spyOn(process, 'on')
      .mockImplementation((event: string | symbol, listener: unknown) => {
        handlers.set(String(event), listener as () => void);
        return process;
      });
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    setupGracefulShutdown();

    expect(handlers.has('SIGTERM')).toBe(true);
    expect(handlers.has('SIGINT')).toBe(true);

    handlers.get('SIGTERM')?.();
    expect(warnSpy).toHaveBeenCalledWith(
      'Received SIGTERM, shutting down gracefully',
    );
    expect(exitSpy).toHaveBeenCalledWith(0);

    handlers.get('SIGINT')?.();
    expect(warnSpy).toHaveBeenCalledWith(
      'Received SIGINT, shutting down gracefully',
    );

    onSpy.mockRestore();
    exitSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe('setupServiceShell', () => {
  interface MockExpressApp {
    enableShutdownHooks: ReturnType<typeof vi.fn>;
    getHttpAdapter: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  }

  const buildApp = (serverGet: ReturnType<typeof vi.fn>): MockExpressApp => ({
    enableShutdownHooks: vi.fn(),
    getHttpAdapter: vi.fn(() => ({
      getInstance: () => ({ get: serverGet }),
    })),
    set: vi.fn(),
  });

  it('configures trust proxy and shutdown hooks without redirects by default', () => {
    const serverGet = vi.fn();
    const app = buildApp(serverGet);

    setupServiceShell(app as unknown as NestExpressApplication);

    expect(app.set).toHaveBeenCalledWith('trust proxy', 1);
    expect(app.enableShutdownHooks).toHaveBeenCalledOnce();
    expect(serverGet).not.toHaveBeenCalled();
  });

  it('registers redirect handlers for each configured path', () => {
    const serverGet = vi.fn();
    const app = buildApp(serverGet);

    setupServiceShell(app as unknown as NestExpressApplication, {
      redirectPaths: ['/', '/docs'],
      redirectTarget: '/v1/health',
      trustProxy: 2,
    });

    expect(app.set).toHaveBeenCalledWith('trust proxy', 2);
    expect(serverGet).toHaveBeenCalledTimes(2);
    expect(serverGet).toHaveBeenCalledWith('/', expect.any(Function));
    expect(serverGet).toHaveBeenCalledWith('/docs', expect.any(Function));

    const redirect = vi.fn();
    const handler = serverGet.mock.calls[0]?.[1] as (
      req: Request,
      res: Response,
    ) => void;
    handler({} as Request, { redirect } as unknown as Response);

    expect(redirect).toHaveBeenCalledWith('/v1/health');
  });
});
