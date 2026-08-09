import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runService } from './run-service';

vi.mock('@nestjs/core', () => ({
  NestFactory: {
    create: vi.fn(),
  },
}));

@Module({})
class TestAppModule {}

class TestConfigService {
  get(_key: 'PORT'): number | string {
    return 3020;
  }
}

interface MockApp {
  enableShutdownHooks: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  getHttpAdapter: ReturnType<typeof vi.fn>;
  listen: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  setGlobalPrefix: ReturnType<typeof vi.fn>;
}

describe('runService', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const serverGet = vi.fn();
  let app: MockApp;
  let onSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    app = {
      enableShutdownHooks: vi.fn(),
      get: vi.fn((token: unknown) => {
        if (token === LoggerService) {
          return logger;
        }
        return new TestConfigService();
      }),
      getHttpAdapter: vi.fn(() => ({
        getInstance: () => ({ get: serverGet }),
      })),
      listen: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
      setGlobalPrefix: vi.fn(),
    };
    vi.mocked(NestFactory.create).mockResolvedValue(
      app as unknown as Awaited<ReturnType<typeof NestFactory.create>>,
    );

    onSpy = vi
      .spyOn(process, 'on')
      .mockImplementation(() => process) as ReturnType<typeof vi.spyOn>;
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never) as ReturnType<
      typeof vi.spyOn
    >;
  });

  afterEach(() => {
    onSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('boots the service shell and listens on the configured port', async () => {
    await runService({
      configService: TestConfigService,
      module: TestAppModule,
      serviceName: 'images',
    });

    expect(NestFactory.create).toHaveBeenCalledWith(
      TestAppModule,
      expect.objectContaining({ abortOnError: false, logger: ['error'] }),
    );
    expect(app.set).toHaveBeenCalledWith('trust proxy', 1);
    expect(app.enableShutdownHooks).toHaveBeenCalledOnce();
    expect(serverGet).toHaveBeenCalledWith('/', expect.any(Function));
    expect(app.setGlobalPrefix).toHaveBeenCalledWith('v1');
    expect(app.listen).toHaveBeenCalledWith(3020);
    expect(logger.debug).toHaveBeenCalledWith(
      'images service is running on port 3020',
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('honors custom shell options and global prefix', async () => {
    await runService({
      configService: TestConfigService,
      globalPrefix: 'v2',
      module: TestAppModule,
      serviceName: 'voices',
      shell: {
        redirectPaths: ['/', '/docs'],
        redirectTarget: '/v2/health',
      },
    });

    expect(serverGet).toHaveBeenCalledWith('/docs', expect.any(Function));
    expect(app.setGlobalPrefix).toHaveBeenCalledWith('v2');
  });

  it('logs and exits when startup fails', async () => {
    const failure = new Error('port busy');
    app.listen.mockRejectedValue(failure);

    await runService({
      configService: TestConfigService,
      module: TestAppModule,
      serviceName: 'videos',
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to start videos service:',
      failure,
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
