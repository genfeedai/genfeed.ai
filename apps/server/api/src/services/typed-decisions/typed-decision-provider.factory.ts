import { JevTypedDecisionProvider } from '@api/services/typed-decisions/providers/jev-typed-decision.provider';
import { NullTypedDecisionProvider } from '@api/services/typed-decisions/providers/null-typed-decision.provider';
import { JEV_TYPED_DECISION_PROVIDER_NAME } from '@api/services/typed-decisions/typed-decisions.constants';
import { isUnconfiguredSecret } from '@genfeedai/config';
import type {
  TypedDecisionProvider,
  TypedDecisionProviderName,
} from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

/**
 * Whether this deployment *can* run a provider, as opposed to whether an
 * operator has turned it on (#4908).
 *
 * Availability is a credential question and stays in the environment; the
 * admin setting answers the enablement question. Keeping them apart is what
 * lets the API reject "switch to Jev" with a reason instead of storing a
 * setting that silently resolves to the deterministic path.
 */
export function isTypedDecisionProviderAvailable(
  provider: TypedDecisionProviderName,
  configService: ConfigService,
): boolean {
  if (provider !== JEV_TYPED_DECISION_PROVIDER_NAME) {
    return true;
  }

  const apiKey = String(configService.get('TYPESAFE_API_KEY') || '').trim();

  return Boolean(apiKey) && !isUnconfiguredSecret(apiKey);
}

/**
 * Builds the provider an operator selected.
 *
 * A missing key is not a misconfiguration: self-hosted installs are expected
 * to run without one, so anything other than `jev` with a usable key binds the
 * null provider and the product keeps its deterministic behaviour.
 *
 * Shared with `TypedDecisionProviderResolver` and with
 * `scripts/typed-decisions/benchmark.ts`, so the benchmark measures exactly
 * the adapter a deployment would run.
 */
export function createTypedDecisionProvider(
  provider: TypedDecisionProviderName,
  configService: ConfigService,
  logger: LoggerService,
): TypedDecisionProvider {
  if (
    provider === JEV_TYPED_DECISION_PROVIDER_NAME &&
    isTypedDecisionProviderAvailable(provider, configService)
  ) {
    return new JevTypedDecisionProvider(configService, logger);
  }

  if (provider === JEV_TYPED_DECISION_PROVIDER_NAME) {
    logger.warn(
      'Typed decisions are set to Jev but TYPESAFE_API_KEY is not configured; falling back to the deterministic paths',
      { provider },
    );
  }

  return new NullTypedDecisionProvider();
}
