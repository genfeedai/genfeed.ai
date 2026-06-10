import Joi from 'joi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseConfigService } from './base-config.service';
import { createServiceConfig } from './create-service-config';

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn().mockReturnValue(false),
  mockReadFileSync: vi.fn().mockReturnValue(Buffer.from('')),
}));

vi.mock('node:fs', () => ({
  default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

interface SampleEnvConfig {
  NODE_ENV?: 'development' | 'staging' | 'production' | 'test';
  PORT?: number;
  VERSION?: string;
  SAMPLE_SHARED?: string;
  SAMPLE_INLINE?: string;
}

const sharedFragment: Record<string, Joi.Schema> = {
  SAMPLE_SHARED: Joi.string().optional().allow(''),
};

describe('createServiceConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockExistsSync.mockReset().mockReturnValue(false);
    mockReadFileSync.mockReset().mockReturnValue(Buffer.from(''));
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3999';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('returns a constructable class that extends BaseConfigService', () => {
    const ServiceConfig = createServiceConfig<SampleEnvConfig>({
      appName: 'sample',
    });
    const service = new ServiceConfig();

    expect(service).toBeInstanceOf(BaseConfigService);
  });

  it('always merges baseSchema so its defaults apply', () => {
    const ServiceConfig = createServiceConfig<SampleEnvConfig>({
      appName: 'sample',
    });
    const service = new ServiceConfig();

    // VERSION default ('v1') comes from baseSchema, not from the caller.
    expect(service.get('VERSION')).toBe('v1');
  });

  it('enforces baseSchema validation (PORT required)', () => {
    delete process.env.PORT;
    const ServiceConfig = createServiceConfig<SampleEnvConfig>({
      appName: 'sample',
    });

    expect(() => new ServiceConfig()).toThrow('Config validation error');
  });

  it('merges shared fragments passed via schemas', () => {
    process.env.SAMPLE_SHARED = 'shared-value';
    const ServiceConfig = createServiceConfig<SampleEnvConfig>({
      appName: 'sample',
      schemas: [sharedFragment],
    });
    const service = new ServiceConfig();

    expect(service.get('SAMPLE_SHARED')).toBe('shared-value');
  });

  it('merges inline keys passed via extend', () => {
    process.env.SAMPLE_INLINE = 'inline-value';
    const ServiceConfig = createServiceConfig<SampleEnvConfig>({
      appName: 'sample',
      extend: { SAMPLE_INLINE: Joi.string().optional().allow('') },
    });
    const service = new ServiceConfig();

    expect(service.get('SAMPLE_INLINE')).toBe('inline-value');
  });

  it('lets extend override schemas on key collision', () => {
    const ServiceConfig = createServiceConfig<SampleEnvConfig>({
      appName: 'sample',
      schemas: [{ SAMPLE_SHARED: Joi.string().default('from-shared') }],
      extend: { SAMPLE_SHARED: Joi.string().default('from-extend') },
    });
    const service = new ServiceConfig();

    expect(service.get('SAMPLE_SHARED')).toBe('from-extend');
  });

  it('defaults workingDir to apps/server when omitted', () => {
    const ServiceConfig = createServiceConfig<SampleEnvConfig>({
      appName: 'sample',
    });

    new ServiceConfig();

    const checkedPaths = mockExistsSync.mock.calls.map(
      (call: [string]) => call[0],
    );
    // apps/server working dir resolves env files relative to ../../ + appName/.
    expect(checkedPaths.some((p) => p.startsWith('../../'))).toBe(true);
    expect(checkedPaths.some((p) => p.startsWith('sample/'))).toBe(true);
  });

  it('honours an explicit workingDir of root', () => {
    const ServiceConfig = createServiceConfig<SampleEnvConfig>({
      appName: 'sample',
      workingDir: 'root',
    });

    new ServiceConfig();

    const checkedPaths = mockExistsSync.mock.calls.map(
      (call: [string]) => call[0],
    );
    expect(checkedPaths.some((p) => p.startsWith('apps/server/sample/'))).toBe(
      true,
    );
  });

  it('exposes subclass getters backed by validated config', () => {
    class ConfigService extends createServiceConfig<SampleEnvConfig>({
      appName: 'sample',
      extend: { SAMPLE_INLINE: Joi.string().optional().allow('') },
    }) {
      public get sampleInline(): string {
        return this.get('SAMPLE_INLINE') ?? '';
      }
    }

    process.env.SAMPLE_INLINE = 'from-getter';
    const service = new ConfigService();

    expect(service.sampleInline).toBe('from-getter');
  });
});
