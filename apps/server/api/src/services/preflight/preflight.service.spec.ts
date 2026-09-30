import { PreflightService } from '@api/services/preflight/preflight.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';

const mockLogger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

const createMockConfig = (envConfig: Record<string, unknown> = {}) => ({
  get: vi.fn((key: string) => {
    const value = envConfig[key];
    return value === 'PLACEHOLDER_NOT_CONFIGURED' ? undefined : value;
  }),
});

const readyConfig = (overrides: Record<string, string> = {}) =>
  ({
    AWS_ACCESS_KEY_ID: 'test-key',
    AWS_S3_BUCKET: 'test-bucket',
    DATABASE_URL: 'postgresql://localhost/genfeed_test',
    INSTAGRAM_APP_ID: 'ig-id',
    INSTAGRAM_APP_SECRET: 'ig-secret',
    OPENAI_API_KEY: 'sk-test',
    ...overrides,
  }) satisfies Record<string, string>;

describe('PreflightService', () => {
  let service: PreflightService;

  const buildModule = async (envConfig: Record<string, unknown> = {}) => {
    const module = await Test.createTestingModule({
      providers: [
        PreflightService,
        { provide: ConfigService, useValue: createMockConfig(envConfig) },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();
    return module.get(PreflightService);
  };

  beforeEach(async () => {
    service = await buildModule(readyConfig());
  });

  it('returns ready when all env vars set', async () => {
    const r = await service.checkReadiness('analytics');
    expect(r.ready).toBe(true);
    expect(r.status).toBe('ready');
  });

  it('returns not_ready when env vars missing', async () => {
    service = await buildModule({});
    const r = await service.checkReadiness('studio');
    expect(r.ready).toBe(false);
  });

  it('checks all services when no feature', async () => {
    const r = await service.checkReadiness();
    expect(r.checks.length).toBeGreaterThan(0);
  });

  it('returns degraded when partial', async () => {
    service = await buildModule({ OPENAI_API_KEY: 'sk' });
    const r = await service.checkReadiness('studio');
    expect(r.status).toBe('degraded');
  });

  it('uses the Instagram app credentials consumed by the OAuth controller', async () => {
    service = await buildModule({
      DATABASE_URL: 'postgresql://localhost/genfeed_test',
      INSTAGRAM_CLIENT_ID: 'legacy-id',
      INSTAGRAM_CLIENT_SECRET: 'legacy-secret',
    });

    const result = await service.checkReadiness('publish');

    expect(result.ready).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        message: 'Missing: INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET',
        name: 'instagram',
        ok: false,
      }),
    );
  });

  it('rejects placeholder Instagram credentials from validated config', async () => {
    service = await buildModule({
      DATABASE_URL: 'postgresql://localhost/genfeed_test',
      INSTAGRAM_APP_ID: 'PLACEHOLDER_NOT_CONFIGURED',
      INSTAGRAM_APP_SECRET: 'PLACEHOLDER_NOT_CONFIGURED',
    });

    const result = await service.checkReadiness('publish');

    expect(result.ready).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        message: 'Missing: INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET',
        name: 'instagram',
        ok: false,
      }),
    );
  });
});
