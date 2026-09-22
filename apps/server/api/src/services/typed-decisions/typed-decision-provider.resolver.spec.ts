import type { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { JevTypedDecisionProvider } from '@api/services/typed-decisions/providers/jev-typed-decision.provider';
import { NullTypedDecisionProvider } from '@api/services/typed-decisions/providers/null-typed-decision.provider';
import { TypedDecisionProviderResolver } from '@api/services/typed-decisions/typed-decision-provider.resolver';
import { TYPED_DECISION_PROVIDER_CACHE_TTL_MS } from '@api/services/typed-decisions/typed-decisions.constants';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TYPESAFE_KEY_ENV = { TYPESAFE_API_KEY: 'typesafe-key' };

function build(env: Record<string, string> = TYPESAFE_KEY_ENV) {
  const getSingleton = vi.fn();
  const warn = vi.fn();
  const resolver = new TypedDecisionProviderResolver(
    { getSingleton } as unknown as PlatformSettingsService,
    { get: vi.fn((key: string) => env[key] ?? '') } as unknown as ConfigService,
    { log: vi.fn(), warn } as unknown as LoggerService,
  );

  return { getSingleton, resolver, warn };
}

function settingsRow(typedDecisionProvider: string) {
  return {
    id: 'platform-settings',
    marginMultiplier: 1,
    typedDecisionProvider,
  };
}

describe('TypedDecisionProviderResolver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('binds the provider the operator selected', async () => {
    const { getSingleton, resolver } = build();
    getSingleton.mockResolvedValue(settingsRow('jev'));

    await expect(resolver.resolve()).resolves.toBeInstanceOf(
      JevTypedDecisionProvider,
    );
  });

  it('binds the null provider for `none`', async () => {
    const { getSingleton, resolver } = build();
    getSingleton.mockResolvedValue(settingsRow('none'));

    await expect(resolver.resolve()).resolves.toBeInstanceOf(
      NullTypedDecisionProvider,
    );
  });

  it('fails closed on a value this deployment does not know', async () => {
    const { getSingleton, resolver } = build();
    getSingleton.mockResolvedValue(settingsRow('some-future-vendor'));

    await expect(resolver.resolve()).resolves.toBeInstanceOf(
      NullTypedDecisionProvider,
    );
  });

  it('reads the setting once per TTL, not once per decision', async () => {
    const { getSingleton, resolver } = build();
    getSingleton.mockResolvedValue(settingsRow('jev'));

    await resolver.resolve();
    await resolver.resolve();
    expect(getSingleton).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(TYPED_DECISION_PROVIDER_CACHE_TTL_MS);
    await resolver.resolve();
    expect(getSingleton).toHaveBeenCalledTimes(2);
  });

  it('reuses the adapter across refreshes so a 429 cooldown survives', async () => {
    const { getSingleton, resolver } = build();
    getSingleton.mockResolvedValue(settingsRow('jev'));

    const first = await resolver.resolve();
    vi.advanceTimersByTime(TYPED_DECISION_PROVIDER_CACHE_TTL_MS);
    const second = await resolver.resolve();

    expect(second).toBe(first);
  });

  it('picks up a kill switch on the next read', async () => {
    const { getSingleton, resolver } = build();
    getSingleton.mockResolvedValue(settingsRow('jev'));
    await resolver.resolve();

    getSingleton.mockResolvedValue(settingsRow('none'));
    vi.advanceTimersByTime(TYPED_DECISION_PROVIDER_CACHE_TTL_MS);

    await expect(resolver.resolve()).resolves.toBeInstanceOf(
      NullTypedDecisionProvider,
    );
  });

  it('collapses concurrent refreshes into one query', async () => {
    const { getSingleton, resolver } = build();
    getSingleton.mockResolvedValue(settingsRow('jev'));

    await Promise.all([
      resolver.resolve(),
      resolver.resolve(),
      resolver.resolve(),
    ]);

    expect(getSingleton).toHaveBeenCalledTimes(1);
  });

  it('falls back to the deterministic path when the settings read fails', async () => {
    const { getSingleton, resolver, warn } = build();
    getSingleton.mockRejectedValue(new Error('database is down'));

    await expect(resolver.resolve()).resolves.toBeInstanceOf(
      NullTypedDecisionProvider,
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('typed-decision provider setting'),
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('caches a failed read so an outage is not a query per decision', async () => {
    const { getSingleton, resolver } = build();
    getSingleton.mockRejectedValue(new Error('database is down'));

    await resolver.resolve();
    await resolver.resolve();

    expect(getSingleton).toHaveBeenCalledTimes(1);
  });

  it('keeps the deterministic path when Jev is selected with no key', async () => {
    const { getSingleton, resolver } = build({});
    getSingleton.mockResolvedValue(settingsRow('jev'));

    await expect(resolver.resolve()).resolves.toBeInstanceOf(
      NullTypedDecisionProvider,
    );
  });
});
