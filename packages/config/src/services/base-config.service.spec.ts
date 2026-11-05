import Joi from 'joi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BaseConfigService,
  type ConfigServiceOptions,
} from './base-config.service';

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn().mockReturnValue(false),
  mockReadFileSync: vi.fn().mockReturnValue(Buffer.from('')),
}));

vi.mock('node:fs', () => ({
  default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

const testSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .default('test'),
  PORT: Joi.number().default(3000),
  SOME_OPTIONAL_VAR: Joi.string().optional().allow(''),
}).unknown(true);

type TestEnvConfig = {
  NODE_ENV?: 'development' | 'staging' | 'production' | 'test';
  PORT?: number;
  SOME_OPTIONAL_VAR?: string;
};

// Concrete implementation for testing
class ConcreteConfigService extends BaseConfigService<TestEnvConfig> {
  constructor(options?: Partial<ConfigServiceOptions>) {
    super(testSchema, {
      appName: 'test-app',
      workingDir: 'apps/server',
      ...options,
    });
  }

  get SOME_OPTIONAL_VAR(): string {
    return this.get('SOME_OPTIONAL_VAR') ?? '';
  }
}

describe('BaseConfigService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockExistsSync.mockReset().mockReturnValue(false);
    mockReadFileSync.mockReset().mockReturnValue(Buffer.from(''));
    process.env = { ...originalEnv };
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  function mockFiles(fileMap: Record<string, string>) {
    mockExistsSync.mockImplementation(
      (filePath: string) => filePath in fileMap,
    );
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath in fileMap) {
        return Buffer.from(fileMap[filePath]);
      }

      throw new Error(`ENOENT: ${filePath}`);
    });
  }

  describe('instantiation', () => {
    it('should be defined', () => {
      const service = new ConcreteConfigService();
      expect(service).toBeDefined();
    });

    it('should throw on config validation error for invalid NODE_ENV', () => {
      vi.stubEnv('NODE_ENV', 'invalid-env');
      expect(() => new ConcreteConfigService()).toThrow(
        'Config validation error',
      );
    });
  });

  describe('get()', () => {
    it('should return the value for a known key', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const service = new ConcreteConfigService();
      expect(service.get('NODE_ENV' as never)).toBe('development');
    });

    it('treats PLACEHOLDER_NOT_CONFIGURED as unset', () => {
      process.env.SOME_OPTIONAL_VAR = 'PLACEHOLDER_NOT_CONFIGURED';
      const service = new ConcreteConfigService();
      expect(service.get('SOME_OPTIONAL_VAR')).toBeUndefined();
    });
  });

  describe('environment detection', () => {
    it('should detect development environment', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const service = new ConcreteConfigService();
      expect(service.isDevelopment).toBe(true);
      expect(service.isProduction).toBe(false);
      expect(service.isStaging).toBe(false);
      expect(service.isTest).toBe(false);
    });

    it('should detect production environment', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const service = new ConcreteConfigService();
      expect(service.isProduction).toBe(true);
      expect(service.isDevelopment).toBe(false);
      expect(service.isStaging).toBe(false);
      expect(service.isTest).toBe(false);
    });

    it('should detect staging environment', () => {
      vi.stubEnv('NODE_ENV', 'staging');
      const service = new ConcreteConfigService();
      expect(service.isStaging).toBe(true);
      expect(service.isDevelopment).toBe(false);
      expect(service.isProduction).toBe(false);
      expect(service.isTest).toBe(false);
    });

    it('should detect test environment', () => {
      vi.stubEnv('NODE_ENV', 'test');
      const service = new ConcreteConfigService();
      expect(service.isTest).toBe(true);
      expect(service.isDevelopment).toBe(false);
      expect(service.isProduction).toBe(false);
      expect(service.isStaging).toBe(false);
    });
  });

  describe('env file loading', () => {
    it('should load values from env files when they exist', () => {
      mockFiles({
        '../../.env.test': 'SOME_OPTIONAL_VAR=from-file',
      });

      const service = new ConcreteConfigService();
      expect(service.SOME_OPTIONAL_VAR).toBe('from-file');
    });

    it('should work with workingDir=root', () => {
      const service = new ConcreteConfigService({ workingDir: 'root' });
      expect(service).toBeDefined();
    });

    it('should not throw when env files do not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(() => new ConcreteConfigService()).not.toThrow();
    });

    it('should prefer process.env over file values', () => {
      process.env.SOME_OPTIONAL_VAR = 'from-process-env';
      mockFiles({
        '../../.env.test': 'SOME_OPTIONAL_VAR=from-root-file',
        'test-app/.env.test': 'SOME_OPTIONAL_VAR=from-app-file',
      });

      const service = new ConcreteConfigService();
      expect(service.SOME_OPTIONAL_VAR).toBe('from-process-env');
    });
  });

  describe('env file paths by environment', () => {
    it.each([
      {
        environment: 'development',
        paths: [
          '.env',
          'apps/server/test-app/.env',
          'apps/server/test-app/.env.local',
          '.env.local',
        ],
        workingDir: 'root' as const,
      },
      {
        environment: 'development',
        paths: [
          '../../.env',
          'test-app/.env',
          'test-app/.env.local',
          '../../.env.local',
        ],
        workingDir: 'apps/server' as const,
      },
      {
        environment: 'production',
        paths: ['.env.production', 'apps/server/test-app/.env.production'],
        workingDir: 'root' as const,
      },
      {
        environment: 'production',
        paths: ['../../.env.production', 'test-app/.env.production'],
        workingDir: 'apps/server' as const,
      },
    ])(
      'preserves exact $environment file precedence from $workingDir',
      ({ environment, paths, workingDir }) => {
        vi.stubEnv('NODE_ENV', environment);
        mockExistsSync.mockReturnValue(false);

        new ConcreteConfigService({ workingDir });

        expect(
          mockExistsSync.mock.calls.map(([checkedPath]) => checkedPath),
        ).toEqual(paths);
      },
    );

    it('should use production env files in production mode', () => {
      vi.stubEnv('NODE_ENV', 'production');
      mockExistsSync.mockReturnValue(false);

      new ConcreteConfigService();

      const checkedPaths = mockExistsSync.mock.calls.map(
        ([checkedPath]) => checkedPath,
      );
      expect(checkedPaths.some((p) => p.includes('.env.production'))).toBe(
        true,
      );
      expect(
        checkedPaths.some((p) => p.includes('test-app/.env.production')),
      ).toBe(true);
    });

    it('should use staging env files in staging mode', () => {
      vi.stubEnv('NODE_ENV', 'staging');
      mockExistsSync.mockReturnValue(false);

      new ConcreteConfigService();

      const checkedPaths = mockExistsSync.mock.calls.map(
        ([checkedPath]) => checkedPath,
      );
      expect(checkedPaths.some((p) => p.includes('.env.staging'))).toBe(true);
      expect(
        checkedPaths.some((p) => p.includes('test-app/.env.staging')),
      ).toBe(true);
    });

    it('should use test env files in test mode', () => {
      vi.stubEnv('NODE_ENV', 'test');
      mockExistsSync.mockReturnValue(false);

      new ConcreteConfigService();

      const checkedPaths = mockExistsSync.mock.calls.map(
        ([checkedPath]) => checkedPath,
      );
      expect(checkedPaths.some((p) => p.includes('.env.test'))).toBe(true);
    });
  });
});
