import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { NullTypedDecisionProvider } from '@api/services/typed-decisions/providers/null-typed-decision.provider';
import { createTypedDecisionProvider } from '@api/services/typed-decisions/typed-decision-provider.factory';
import { TYPED_DECISION_PROVIDER_CACHE_TTL_MS } from '@api/services/typed-decisions/typed-decisions.constants';
import {
  DEFAULT_TYPED_DECISION_PROVIDER,
  parseTypedDecisionProvider,
} from '@genfeedai/contracts/constants';
import type {
  TypedDecisionProvider,
  TypedDecisionProviderName,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Resolves the bound typed-decision provider from the platform-settings
 * singleton (#4908).
 *
 * Why not a `useFactory` binding: that reads config once at module init, so
 * the only way to stop a vendor that has started answering slowly, wrongly or
 * expensively is a deploy. Reading the operator's setting per call — behind a
 * short TTL so it costs one query per process per TTL, not one per decision —
 * makes the kill switch take effect on the next decision.
 *
 * Adapter instances are reused across refreshes: the Jev adapter carries the
 * 429 cooldown it learned, and rebuilding it every TTL would throw that away
 * and walk straight back into the rate limit.
 */
@Injectable()
export class TypedDecisionProviderResolver {
  private readonly adapters = new Map<
    TypedDecisionProviderName,
    TypedDecisionProvider
  >();
  private cached: TypedDecisionProvider = new NullTypedDecisionProvider();
  private cachedUntilMs = 0;
  private pending: Promise<TypedDecisionProvider> | undefined;

  constructor(
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async resolve(): Promise<TypedDecisionProvider> {
    if (Date.now() < this.cachedUntilMs) {
      return this.cached;
    }

    // One refresh per process, however many decisions are in flight.
    this.pending ??= this.refresh().finally(() => {
      this.pending = undefined;
    });

    return this.pending;
  }

  private async refresh(): Promise<TypedDecisionProvider> {
    const selected = await this.readSelectedProvider();
    this.cached = this.adapterFor(selected);
    this.cachedUntilMs = Date.now() + TYPED_DECISION_PROVIDER_CACHE_TTL_MS;

    return this.cached;
  }

  /**
   * A settings read that fails falls back to `none`, so a database blip costs
   * the deterministic path for one TTL rather than a failed decision — and,
   * because the failure is cached like any other answer, it does not turn one
   * outage into a query per decision.
   */
  private async readSelectedProvider(): Promise<TypedDecisionProviderName> {
    try {
      const settings = await this.platformSettingsService.getSingleton();

      return parseTypedDecisionProvider(settings.typedDecisionProvider);
    } catch (error: unknown) {
      this.logger.warn(
        'Failed to read the typed-decision provider setting; using the deterministic paths',
        { error },
      );

      return DEFAULT_TYPED_DECISION_PROVIDER;
    }
  }

  private adapterFor(
    provider: TypedDecisionProviderName,
  ): TypedDecisionProvider {
    const existing = this.adapters.get(provider);
    if (existing) {
      return existing;
    }

    const adapter = createTypedDecisionProvider(
      provider,
      this.configService,
      this.logger,
    );
    this.adapters.set(provider, adapter);

    return adapter;
  }
}
