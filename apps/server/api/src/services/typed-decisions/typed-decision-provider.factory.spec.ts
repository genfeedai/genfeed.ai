import {
  createTypedDecisionProvider,
  isTypedDecisionProviderAvailable,
} from '@api/services/typed-decisions/typed-decision-provider.factory';
import { UNCONFIGURED_SECRET_SENTINEL } from '@genfeedai/config';
import type { TypedDecisionProviderName } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

function configFor(env: Record<string, string>): ConfigService {
  return {
    get: vi.fn((key: string) => env[key] ?? ''),
  } as unknown as ConfigService;
}

describe('isTypedDecisionProviderAvailable', () => {
  it('needs a usable key for Jev', () => {
    expect(isTypedDecisionProviderAvailable('jev', configFor({}))).toBe(false);
    expect(
      isTypedDecisionProviderAvailable(
        'jev',
        configFor({ TYPESAFE_API_KEY: UNCONFIGURED_SECRET_SENTINEL }),
      ),
    ).toBe(false);
    expect(
      isTypedDecisionProviderAvailable(
        'jev',
        configFor({ TYPESAFE_API_KEY: 'typesafe-key' }),
      ),
    ).toBe(true);
  });
});

describe('createTypedDecisionProvider', () => {
  it('warns when a selected provider has no credential', () => {
    const logger = { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService;
    createTypedDecisionProvider('jev', configFor({}), logger);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('TYPESAFE_API_KEY'),
      { provider: 'jev' },
    );
  });
});
