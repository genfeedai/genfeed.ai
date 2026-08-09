import { ConfigService } from '@voices/config/config.service';

const { existsSyncMock, fsMock, readFileSyncMock } = vi.hoisted(() => {
  const existsSync = vi.fn<(filePath: string) => boolean>(() => false);
  const readFileSync = vi.fn<(filePath: string) => Buffer>(() =>
    Buffer.from(''),
  );

  return {
    existsSyncMock: existsSync,
    fsMock: { existsSync, readFileSync },
    readFileSyncMock: readFileSync,
  };
});

// `@genfeedai/config` imports `node:fs`; Vitest registers `fs` and `node:fs`
// separately, so both specifiers are stubbed to keep the layered `.env`
// resolution from touching the real filesystem.
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));
vi.mock('fs', () => ({ default: fsMock, ...fsMock }));

/**
 * Env keys this suite controls. Every one is cleared before each test so an
 * ambient value from the developer's shell cannot mask a getter's fallback.
 */
const MUTATED_KEYS = [
  'AWS_ACCESS_KEY_ID',
  'AWS_REGION',
  'AWS_S3_BUCKET',
  'AWS_SECRET_ACCESS_KEY',
  'DATASETS_PATH',
  'GENFEEDAI_API_KEY',
  'GENFEEDAI_MICROSERVICES_FILES_URL',
  'REDIS_URL',
  'TTS_INFERENCE_URL',
  'VOICE_MODELS_PATH',
  'VOICE_TRAINING_BINARY_PATH',
] as const;

describe('ConfigService (Voices)', () => {
  beforeEach(() => {
    for (const key of MUTATED_KEYS) {
      vi.stubEnv(key, undefined);
    }
    vi.stubEnv('NODE_ENV', 'test');
    existsSyncMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('is constructible without touching the filesystem', () => {
    const service = new ConfigService();

    expect(service).toBeDefined();
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  describe('TTS_INFERENCE_URL', () => {
    it('falls back to the local inference URL when unset', () => {
      expect(new ConfigService().TTS_INFERENCE_URL).toBe(
        'http://localhost:8188',
      );
    });

    it('returns the configured value', () => {
      vi.stubEnv('TTS_INFERENCE_URL', 'http://tts:9000');
      expect(new ConfigService().TTS_INFERENCE_URL).toBe('http://tts:9000');
    });
  });

  describe('REDIS_URL', () => {
    it('falls back to the local Redis URL when unset', () => {
      expect(new ConfigService().REDIS_URL).toBe('redis://localhost:6379');
    });

    it('returns the configured value', () => {
      vi.stubEnv('REDIS_URL', 'redis://redis:6379');
      expect(new ConfigService().REDIS_URL).toBe('redis://redis:6379');
    });
  });

  describe('API_KEY', () => {
    it('returns an empty string when unset', () => {
      expect(new ConfigService().API_KEY).toBe('');
    });

    it('returns the configured value', () => {
      vi.stubEnv('GENFEEDAI_API_KEY', 'voices-api-key');
      expect(new ConfigService().API_KEY).toBe('voices-api-key');
    });
  });

  describe('FILES_SERVICE_URL', () => {
    it('falls back to the local files service when unset', () => {
      expect(new ConfigService().FILES_SERVICE_URL).toBe(
        'http://localhost:3012',
      );
    });

    it('returns the configured value', () => {
      vi.stubEnv('GENFEEDAI_MICROSERVICES_FILES_URL', 'https://files.test');
      expect(new ConfigService().FILES_SERVICE_URL).toBe('https://files.test');
    });
  });

  describe('VOICE_TRAINING_BINARY_PATH', () => {
    it('falls back to the packaged binary path when unset', () => {
      expect(new ConfigService().VOICE_TRAINING_BINARY_PATH).toBe(
        '/usr/local/bin/voice-train',
      );
    });

    it('returns the configured value', () => {
      vi.stubEnv('VOICE_TRAINING_BINARY_PATH', '/opt/bin/train');
      expect(new ConfigService().VOICE_TRAINING_BINARY_PATH).toBe(
        '/opt/bin/train',
      );
    });
  });

  describe('VOICE_MODELS_PATH', () => {
    it('falls back to /models/voices when unset', () => {
      expect(new ConfigService().VOICE_MODELS_PATH).toBe('/models/voices');
    });

    it('returns the configured value', () => {
      vi.stubEnv('VOICE_MODELS_PATH', '/data/models');
      expect(new ConfigService().VOICE_MODELS_PATH).toBe('/data/models');
    });
  });

  describe('AWS credentials', () => {
    it('returns empty strings and the default region when unset', () => {
      const service = new ConfigService();

      expect(service.AWS_S3_BUCKET).toBe('');
      expect(service.AWS_ACCESS_KEY_ID).toBe('');
      expect(service.AWS_SECRET_ACCESS_KEY).toBe('');
      expect(service.AWS_REGION).toBe('us-east-1');
    });

    it('returns the configured values', () => {
      vi.stubEnv('AWS_S3_BUCKET', 'voices-bucket');
      vi.stubEnv('AWS_ACCESS_KEY_ID', 'AKIA-TEST');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'secret-test');
      vi.stubEnv('AWS_REGION', 'eu-west-1');

      const service = new ConfigService();

      expect(service.AWS_S3_BUCKET).toBe('voices-bucket');
      expect(service.AWS_ACCESS_KEY_ID).toBe('AKIA-TEST');
      expect(service.AWS_SECRET_ACCESS_KEY).toBe('secret-test');
      expect(service.AWS_REGION).toBe('eu-west-1');
    });
  });

  describe('DATASETS_PATH', () => {
    it('falls back to /datasets when unset', () => {
      expect(new ConfigService().DATASETS_PATH).toBe('/datasets');
    });

    it('returns the configured value', () => {
      vi.stubEnv('DATASETS_PATH', '/mnt/datasets');
      expect(new ConfigService().DATASETS_PATH).toBe('/mnt/datasets');
    });
  });

  describe('environment flags', () => {
    it('reports the test environment', () => {
      const service = new ConfigService();

      expect(service.isTest).toBe(true);
      expect(service.isDevelopment).toBe(false);
      expect(service.isProduction).toBe(false);
      expect(service.isStaging).toBe(false);
    });

    it('reports the production environment', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const service = new ConfigService();

      expect(service.isProduction).toBe(true);
      expect(service.isTest).toBe(false);
    });

    it('reports the staging environment', () => {
      vi.stubEnv('NODE_ENV', 'staging');
      const service = new ConfigService();

      expect(service.isStaging).toBe(true);
      expect(service.isProduction).toBe(false);
    });

    it('reports the development environment', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const service = new ConfigService();

      expect(service.isDevelopment).toBe(true);
      expect(service.isTest).toBe(false);
    });
  });

  describe('env-file layering', () => {
    it('reads the layered .env files when they exist', () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(
        Buffer.from('VOICE_MODELS_PATH=/from-file\n'),
      );

      const service = new ConfigService();

      expect(readFileSyncMock).toHaveBeenCalled();
      expect(service.VOICE_MODELS_PATH).toBe('/from-file');
    });

    it('lets live process.env win over env-file values', () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(
        Buffer.from('VOICE_MODELS_PATH=/from-file\n'),
      );
      vi.stubEnv('VOICE_MODELS_PATH', '/from-process');

      expect(new ConfigService().VOICE_MODELS_PATH).toBe('/from-process');
    });
  });
});
