import { LlmVendorCostLedgerService } from '@api/services/integrations/llm/llm-vendor-cost-ledger.service';
import { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import { createTypedDecisionProvider } from '@api/services/typed-decisions/typed-decision-provider.factory';
import { TypedDecisionTelemetryService } from '@api/services/typed-decisions/typed-decision-telemetry.service';
import { TYPED_DECISION_PROVIDER } from '@api/services/typed-decisions/typed-decisions.tokens';
import { createServiceModule } from '@api/shared/service-module.factory';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import type { Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';

/**
 * The provider is chosen once, at module init, from validated config.
 */
const typedDecisionProvider: Provider = {
  inject: [ConfigService, LoggerService],
  provide: TYPED_DECISION_PROVIDER,
  useFactory: createTypedDecisionProvider,
};

/**
 * Typed decisions (#4864).
 *
 * The vendor-cost ledger is provided directly rather than by importing
 * LlmDispatcherModule: a decision needs the ledger (PrismaModule is global),
 * not the gateway, its Redis connection or its settlement queue.
 */
const BaseModule = createServiceModule(TypedDecisionService, {
  additionalExports: [TypedDecisionTelemetryService],
  additionalProviders: [
    typedDecisionProvider,
    TypedDecisionTelemetryService,
    LlmVendorCostLedgerService,
  ],
});

@Module({
  exports: [...(BaseModule.exports ?? [])],
  imports: [...(BaseModule.imports ?? [])],
  providers: [...((BaseModule.providers ?? []) as Provider[])],
})
export class TypedDecisionsModule {}
