import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { BrandValidationModule } from '@api/services/brand-validation/brand-validation.module';
import { BrandValidationReceiptModule } from '@api/services/brand-validation/brand-validation-receipt.module';
import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import { BrandedModeResolverService } from '@api/services/branded-text-generation/branded-mode-resolver.service';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { SkillRuntimeModule } from '@api/services/skill-runtime/skill-runtime.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    BrandAccessModule,
    BrandsCoreModule,
    BrandedGenerationReceiptsModule,
    BrandValidationModule,
    BrandValidationReceiptModule,
    ContentHarnessModule,
    OpenRouterModule,
    SkillRuntimeModule,
  ],
  providers: [BrandedTextGenerationService, BrandedModeResolverService],
  exports: [BrandedTextGenerationService, BrandedModeResolverService],
})
export class BrandedTextGenerationModule {}
