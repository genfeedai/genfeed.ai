import 'reflect-metadata';
import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
import { BrandValidationModule } from '@api/services/brand-validation/brand-validation.module';
import { BrandValidationReceiptModule } from '@api/services/brand-validation/brand-validation-receipt.module';
import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import { BrandedTextGenerationModule } from '@api/services/branded-text-generation/branded-text-generation.module';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { SkillRuntimeModule } from '@api/services/skill-runtime/skill-runtime.module';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

describe('BrandedTextGenerationModule', () => {
  const metadata = (key: string) =>
    Reflect.getMetadata(key, BrandedTextGenerationModule) as unknown[];

  it('composes receipts, validation, harness, skills and OpenRouter', () => {
    expect(new Set(metadata(MODULE_METADATA.IMPORTS))).toEqual(
      new Set([
        BrandAccessModule,
        BrandedGenerationReceiptsModule,
        BrandValidationModule,
        BrandValidationReceiptModule,
        ContentHarnessModule,
        OpenRouterModule,
        SkillRuntimeModule,
      ]),
    );
  });

  it('provides and exports only the orchestrator', () => {
    expect(metadata(MODULE_METADATA.PROVIDERS)).toEqual([
      BrandedTextGenerationService,
    ]);
    expect(metadata(MODULE_METADATA.EXPORTS)).toEqual([
      BrandedTextGenerationService,
    ]);
  });
});
