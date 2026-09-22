import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { LlmVendorCostLedgerService } from '@api/services/integrations/llm/llm-vendor-cost-ledger.service';
import { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import { TypedDecisionProviderResolver } from '@api/services/typed-decisions/typed-decision-provider.resolver';
import { TypedDecisionTelemetryService } from '@api/services/typed-decisions/typed-decision-telemetry.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import type { Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';

/**
 * Typed decisions (#4864, runtime provider selection #4908).
 *
 * The provider is not bound here: `TypedDecisionProviderResolver` reads the
 * operator's platform setting per call, so turning a vendor off is a click
 * rather than a deploy.
 *
 * The vendor-cost ledger is provided directly rather than by importing
 * LlmDispatcherModule: a decision needs the ledger (PrismaModule is global),
 * not the gateway, its Redis connection or its settlement queue.
 */
const BaseModule = createServiceModule(TypedDecisionService, {
  additionalExports: [TypedDecisionTelemetryService],
  additionalImports: [PlatformSettingsModule],
  additionalProviders: [
    TypedDecisionProviderResolver,
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
