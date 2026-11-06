import type { CacheService } from '@api/services/cache/cache.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { type Mock, vi } from 'vitest';

export const mockLoggerService = (): Partial<LoggerService> => ({
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  verbose: vi.fn(),
  warn: vi.fn(),
});

/** A config stub that reads every key from `config`. */
export const mockConfigService = (config: Record<string, unknown> = {}) => ({
  get: vi.fn((key: string) => config[key]),
  getNumber: vi.fn((key: string) => Number(config[key])),
});

export const mockCacheService = (): Partial<CacheService> => ({
  exists: vi.fn().mockResolvedValue(false),
  generateKey: vi.fn((...args: string[]) => args.join(':')),
  get: vi.fn().mockResolvedValue(null),
  invalidateByTags: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(true),
});

export const mockRequest = (overrides: Record<string, unknown> = {}) => ({
  body: {},
  headers: {},
  params: {},
  query: {},
  user: {
    email: 'test@example.com',
    id: 'user-id',
    isSuperAdmin: false,
    userId: 'user-id',
  },
  ...overrides,
});

/**
 * A `findOneSelect` mock that answers through the same mock object's
 * `findOne`, so a spec that stubs `findOne` keeps covering callers that read
 * only a projection of the row.
 */
export const delegateFindOneSelect = (): Mock => {
  const findOneSelect: Mock = vi.fn();
  findOneSelect.mockImplementation(function (
    this: { findOne: (params: unknown) => unknown },
    params: unknown,
  ) {
    return this.findOne(params);
  });
  return findOneSelect;
};
