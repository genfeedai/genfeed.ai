import { JevTypedDecisionProvider } from '@api/services/typed-decisions/providers/jev-typed-decision.provider';
import { NullTypedDecisionProvider } from '@api/services/typed-decisions/providers/null-typed-decision.provider';
import { createTypedDecisionProvider } from '@api/services/typed-decisions/typed-decision-provider.factory';
import { UNCONFIGURED_SECRET_SENTINEL } from '@genfeedai/config';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

function bind(env: Record<string, string>) {
  const configService = {
    get: vi.fn((key: string) => env[key] ?? ''),
  } as unknown as ConfigService;
  const logger = { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService;

  return createTypedDecisionProvider(configService, logger);
}

describe('createTypedDecisionProvider', () => {
  it('binds the null provider when nothing is configured', () => {
    expect(bind({})).toBeInstanceOf(NullTypedDecisionProvider);
  });

  it('binds the null provider for TYPED_DECISION_PROVIDER=none', () => {
    expect(
      bind({
        TYPED_DECISION_PROVIDER: 'none',
        TYPESAFE_API_KEY: 'typesafe-key',
      }),
    ).toBeInstanceOf(NullTypedDecisionProvider);
  });

  it('binds the null provider when the Jev key is missing', () => {
    expect(bind({ TYPED_DECISION_PROVIDER: 'jev' })).toBeInstanceOf(
      NullTypedDecisionProvider,
    );
  });

  it('treats the unprovisioned-secret sentinel as no key', () => {
    expect(
      bind({
        TYPED_DECISION_PROVIDER: 'jev',
        TYPESAFE_API_KEY: UNCONFIGURED_SECRET_SENTINEL,
      }),
    ).toBeInstanceOf(NullTypedDecisionProvider);
  });

  it('binds Jev when the provider is selected and the key is present', () => {
    expect(
      bind({
        TYPED_DECISION_PROVIDER: 'jev',
        TYPESAFE_API_KEY: 'typesafe-key',
      }),
    ).toBeInstanceOf(JevTypedDecisionProvider);
  });
});
