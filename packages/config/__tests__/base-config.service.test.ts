import Joi from 'joi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn().mockReturnValue(false),
  mockReadFileSync: vi.fn().mockReturnValue(Buffer.from('')),
}));

vi.mock('node:fs', () => ({
  default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

import { BaseConfigService } from '@config/services/base-config.service';

class TestConfigService extends BaseConfigService<{
  NODE_ENV: string;
  PORT: number;
  CUSTOM: string;
}> {
  constructor(options: {
    appName: string;
    workingDir: 'apps/server' | 'root';
  }) {
    super(
      Joi.object({
        CUSTOM: Joi.string().default('default-val'),
        NODE_ENV: Joi.string()
          .valid('development', 'staging', 'production', 'test')
          .default('development'),
        PORT: Joi.number().required(),
      }),
      options,
    );
  }
}

describe('BaseConfigService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockExistsSync.mockReset().mockReturnValue(false);
    mockReadFileSync.mockReset().mockReturnValue(Buffer.from(''));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function mockFiles(fileMap: Record<string, string>) {
    mockExistsSync.mockImplementation((p: any) => p in fileMap);
    mockReadFileSync.mockImplementation((p: any) => {
      if (p in fileMap) return Buffer.from(fileMap[p]);
      throw new Error(`ENOENT: ${p}`);
    });
  }

  it('should create service with valid config from process.env', () => {
    process.env.PORT = '3000';
    process.env.NODE_ENV = 'test';
    const service = new TestConfigService({
      appName: 'api',
      workingDir: 'root',
    });
    expect(service.get('PORT')).toBe(3000);
    expect(service.get('NODE_ENV')).toBe('test');
  });

  it('should apply defaults for missing optional values', () => {
    process.env.PORT = '3000';
    const service = new TestConfigService({
      appName: 'api',
      workingDir: 'root',
    });
    expect(service.get('CUSTOM')).toBe('default-val');
  });

  it('should throw on missing required values', () => {
    delete process.env.PORT;
    expect(
      () => new TestConfigService({ appName: 'api', workingDir: 'root' }),
    ).toThrow('Config validation error');
  });

  // NOTE: vitest sets NODE_ENV=test, so test-specific env paths are used
  it('should read test env files (root workingDir)', () => {
    process.env.PORT = '3000';
    process.env.NODE_ENV = 'test';
    mockFiles({ '.env.test': 'CUSTOM=from-test-env' });
    const service = new TestConfigService({
      appName: 'api',
      workingDir: 'root',
    });
    expect(service.get('CUSTOM')).toBe('from-test-env');
  });

  it('should read test env files (apps/server workingDir)', () => {
    process.env.PORT = '3000';
    process.env.NODE_ENV = 'test';
    mockFiles({ '../../.env.test': 'CUSTOM=from-server-test' });
    const service = new TestConfigService({
      appName: 'api',
      workingDir: 'apps/server',
    });
    expect(service.get('CUSTOM')).toBe('from-server-test');
  });

  it('should load production env files (root)', () => {
    process.env.NODE_ENV = 'production';
    process.env.PORT = '3000';
    mockFiles({ '.env.production': 'CUSTOM=prod-value' });
    const service = new TestConfigService({
      appName: 'api',
      workingDir: 'root',
    });
    expect(service.get('CUSTOM')).toBe('prod-value');
  });

  it('should load production env files (apps/server)', () => {
    process.env.NODE_ENV = 'production';
    process.env.PORT = '3000';
    mockFiles({ '../../.env.production': 'CUSTOM=prod-server' });
    const service = new TestConfigService({
      appName: 'api',
      workingDir: 'apps/server',
    });
    expect(service.get('CUSTOM')).toBe('prod-server');
  });

  it('should load staging env files (root)', () => {
    process.env.NODE_ENV = 'staging';
    process.env.PORT = '3000';
    mockFiles({ '.env.staging': 'CUSTOM=staging-value' });
    const service = new TestConfigService({
      appName: 'api',
      workingDir: 'root',
    });
    expect(service.get('CUSTOM')).toBe('staging-value');
  });

  it('should load staging env files (apps/server)', () => {
    process.env.NODE_ENV = 'staging';
    process.env.PORT = '3000';
    mockFiles({ '../../.env.staging': 'CUSTOM=staging-server' });
    const service = new TestConfigService({
      appName: 'api',
      workingDir: 'apps/server',
    });
    expect(service.get('CUSTOM')).toBe('staging-server');
  });

  it('should load dev env files with .local override (root)', () => {
    process.env.PORT = '3000';
    delete process.env.NODE_ENV; // Force non-test/prod
    // With NODE_ENV undefined, schema defaults to 'development'
    mockFiles({ '.env': 'CUSTOM=base', '.env.local': 'CUSTOM=override' });
    const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
    expect(s.get('CUSTOM')).toBe('override');
  });

  it('app-specific test env files (root)', () => {
    process.env.PORT = '3000';
    process.env.NODE_ENV = 'test';
    mockFiles({ 'apps/server/api/.env.test': 'CUSTOM=app-test' });
    const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
    expect(s.get('CUSTOM')).toBe('app-test');
  });

  it('app-specific test env files (apps/server)', () => {
    process.env.PORT = '3000';
    process.env.NODE_ENV = 'test';
    mockFiles({ 'api/.env.test': 'CUSTOM=app-test-server' });
    const s = new TestConfigService({
      appName: 'api',
      workingDir: 'apps/server',
    });
    expect(s.get('CUSTOM')).toBe('app-test-server');
  });

  it('app-specific production env files override root values (root)', () => {
    process.env.NODE_ENV = 'production';
    process.env.PORT = '3000';
    mockFiles({
      '.env.production': 'CUSTOM=root-prod',
      'apps/server/api/.env.production': 'CUSTOM=app-prod',
    });
    const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
    expect(s.get('CUSTOM')).toBe('app-prod');
  });

  it('app-specific production env files override root values (apps/server)', () => {
    process.env.NODE_ENV = 'production';
    process.env.PORT = '3000';
    mockFiles({
      '../../.env.production': 'CUSTOM=root-prod-s',
      'api/.env.production': 'CUSTOM=app-prod-s',
    });
    const s = new TestConfigService({
      appName: 'api',
      workingDir: 'apps/server',
    });
    expect(s.get('CUSTOM')).toBe('app-prod-s');
  });

  it('app-specific staging env files override root values (root)', () => {
    process.env.NODE_ENV = 'staging';
    process.env.PORT = '3000';
    mockFiles({
      '.env.staging': 'CUSTOM=root-staging',
      'apps/server/api/.env.staging': 'CUSTOM=app-staging',
    });
    const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
    expect(s.get('CUSTOM')).toBe('app-staging');
  });

  it('app-specific staging env files override root values (apps/server)', () => {
    process.env.NODE_ENV = 'staging';
    process.env.PORT = '3000';
    mockFiles({
      '../../.env.staging': 'CUSTOM=root-staging-s',
      'api/.env.staging': 'CUSTOM=app-staging-s',
    });
    const s = new TestConfigService({
      appName: 'api',
      workingDir: 'apps/server',
    });
    expect(s.get('CUSTOM')).toBe('app-staging-s');
  });

  it('app-specific files override root files', () => {
    process.env.PORT = '3000';
    process.env.NODE_ENV = 'test';
    mockFiles({
      '.env.test': 'CUSTOM=root-val',
      'apps/server/api/.env.test': 'CUSTOM=app-val',
    });
    const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
    expect(s.get('CUSTOM')).toBe('app-val');
  });

  it('process.env overrides file values', () => {
    process.env.PORT = '3000';
    process.env.NODE_ENV = 'staging';
    process.env.CUSTOM = 'runtime-val';
    mockFiles({
      '.env.staging': 'CUSTOM=root-staging',
      'apps/server/api/.env.staging': 'CUSTOM=app-staging',
    });
    const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
    expect(s.get('CUSTOM')).toBe('runtime-val');
  });

  describe('environment helpers', () => {
    it('isDevelopment', () => {
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'development';
      const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
      expect(s.isDevelopment).toBe(true);
      expect(s.isProduction).toBe(false);
      expect(s.isStaging).toBe(false);
      expect(s.isTest).toBe(false);
    });

    it('isProduction', () => {
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'production';
      const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
      expect(s.isProduction).toBe(true);
    });

    it('isStaging', () => {
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'staging';
      const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
      expect(s.isStaging).toBe(true);
    });

    it('isTest', () => {
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'test';
      const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
      expect(s.isTest).toBe(true);
    });
  });
});
