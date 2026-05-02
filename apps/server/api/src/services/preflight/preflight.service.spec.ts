import { ConfigService } from '@api/config/config.service';
import { PreflightService } from '@api/services/preflight/preflight.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';

const mockLogger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

const createMockConfig = (envConfig: Record<string, unknown> = {}) => ({
  envConfig,
});

function stubReadyEnv(overrides: Record<string, string> = {}) {
  const env = {
    AWS_ACCESS_KEY_ID: 'test-key',
    AWS_S3_BUCKET: 'test-bucket',
    DATABASE_URL: 'postgresql://localhost/genfeed_test',
    INSTAGRAM_CLIENT_ID: 'ig-id',
    INSTAGRAM_CLIENT_SECRET: 'ig-secret',
    OPENAI_API_KEY: 'sk-test',
    ...overrides,
  };

  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
}

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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    stubReadyEnv();
    service = await buildModule({
      AWS_ACCESS_KEY_ID: 'test-key',
      AWS_S3_BUCKET: 'test-bucket',
      DATABASE_URL: 'postgresql://localhost/genfeed_test',
      INSTAGRAM_CLIENT_ID: 'ig-id',
      INSTAGRAM_CLIENT_SECRET: 'ig-secret',
      OPENAI_API_KEY: 'sk-test',
    });
  });

  it('returns ready when all env vars set', async () => {
    const r = await service.checkReadiness('analytics');
    expect(r.ready).toBe(true);
    expect(r.status).toBe('ready');
  });

  it('returns not_ready when env vars missing', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('AWS_S3_BUCKET', '');
    vi.stubEnv('AWS_ACCESS_KEY_ID', '');
    service = await buildModule({});
    const r = await service.checkReadiness('studio');
    expect(r.ready).toBe(false);
  });

  it('checks all services when no feature', async () => {
    const r = await service.checkReadiness();
    expect(r.checks.length).toBeGreaterThan(0);
  });

  it('returns degraded when partial', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk');
    vi.stubEnv('AWS_S3_BUCKET', '');
    vi.stubEnv('AWS_ACCESS_KEY_ID', '');
    service = await buildModule({ OPENAI_API_KEY: 'sk' });
    const r = await service.checkReadiness('studio');
    expect(r.status).toBe('degraded');
  });
});
