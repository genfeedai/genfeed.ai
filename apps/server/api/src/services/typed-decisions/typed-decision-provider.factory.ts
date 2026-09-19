import { JevTypedDecisionProvider } from '@api/services/typed-decisions/providers/jev-typed-decision.provider';
import { NullTypedDecisionProvider } from '@api/services/typed-decisions/providers/null-typed-decision.provider';
import { JEV_TYPED_DECISION_PROVIDER_NAME } from '@api/services/typed-decisions/typed-decisions.constants';
import { isUnconfiguredSecret } from '@genfeedai/config';
import type { TypedDecisionProvider } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

/**
 * Binds the typed-decision provider (#4864).
 *
 * A missing key is not a misconfiguration: self-hosted installs are expected
 * to run without one, so anything other than `jev` with a usable key binds the
 * null provider and the product keeps its deterministic behaviour.
 *
 * Shared with `scripts/typed-decisions/benchmark.ts`, which benchmarks exactly
 * the provider a deployment would bind.
 */
export function createTypedDecisionProvider(
  configService: ConfigService,
  logger: LoggerService,
): TypedDecisionProvider {
  const configured = String(
    configService.get('TYPED_DECISION_PROVIDER') || '',
  ).trim();
  const apiKey = String(configService.get('TYPESAFE_API_KEY') || '').trim();
  const hasApiKey = Boolean(apiKey) && !isUnconfiguredSecret(apiKey);

  if (configured === JEV_TYPED_DECISION_PROVIDER_NAME && hasApiKey) {
    logger.log('Typed decisions bound to the Jev provider', {
      provider: JEV_TYPED_DECISION_PROVIDER_NAME,
    });
    return new JevTypedDecisionProvider(configService, logger);
  }

  logger.log('Typed decisions disabled; deterministic paths stay in control', {
    hasApiKey,
    provider: configured || 'none',
  });
  return new NullTypedDecisionProvider();
}
