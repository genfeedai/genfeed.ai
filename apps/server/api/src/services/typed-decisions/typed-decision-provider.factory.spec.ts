import { JevTypedDecisionProvider } from '@api/services/typed-decisions/providers/jev-typed-decision.provider';
import { NullTypedDecisionProvider } from '@api/services/typed-decisions/providers/null-typed-decision.provider';
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

function bind(
  provider: TypedDecisionProviderName,
  env: Record<string, string>,
) {
  const logger = { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService;

  return createTypedDecisionProvider(provider, configFor(env), logger);
}

describe('isTypedDecisionProviderAvailable', () => {
  it('needs no credential for the null provider', () => {
    expect(isTypedDecisionProviderAvailable('none', configFor({}))).toBe(true);
  });

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
  it('binds the null provider for the `none` selection', () => {
    expect(bind('none', { TYPESAFE_API_KEY: 'typesafe-key' })).toBeInstanceOf(
      NullTypedDecisionProvider,
    );
  });

  it('binds the null provider when the Jev key is missing', () => {
    expect(bind('jev', {})).toBeInstanceOf(NullTypedDecisionProvider);
  });

  it('treats the unprovisioned-secret sentinel as no key', () => {
    expect(
      bind('jev', { TYPESAFE_API_KEY: UNCONFIGURED_SECRET_SENTINEL }),
    ).toBeInstanceOf(NullTypedDecisionProvider);
  });

  it('binds Jev when it is selected and the key is present', () => {
    expect(bind('jev', { TYPESAFE_API_KEY: 'typesafe-key' })).toBeInstanceOf(
      JevTypedDecisionProvider,
    );
  });

  it('warns when a selected provider has no credential', () => {
    const logger = { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService;
    createTypedDecisionProvider('jev', configFor({}), logger);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('TYPESAFE_API_KEY'),
      { provider: 'jev' },
    );
  });
});
