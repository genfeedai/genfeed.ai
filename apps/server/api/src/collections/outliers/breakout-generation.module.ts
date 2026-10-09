import { AgentStrategiesCoreModule } from '@api/collections/agent-strategies/agent-strategies-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { OptimizersModule } from '@api/collections/optimizers/optimizers.module';
import { BreakoutMediaOutputGenerationService } from '@api/collections/outliers/services/breakout-media-output-generation.service';
import { BreakoutOutputQualityService } from '@api/collections/outliers/services/breakout-output-quality.service';
import { BreakoutTextOutputGenerationService } from '@api/collections/outliers/services/breakout-text-output-generation.service';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { AgentGenerationGatewayModule } from '@api/services/agent-generation-gateway/agent-generation-gateway.module';
import { BrandValidationModule } from '@api/services/brand-validation/brand-validation.module';
import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import { BrandedTextGenerationModule } from '@api/services/branded-text-generation/branded-text-generation.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

/** Concrete generation consumers; analytics evidence and read services remain independent of this graph. */
@Module({
  imports: [
    AgentStrategiesCoreModule,
    OptimizersModule,
    CreditsModule,
    PostsCoreModule,
    AgentGenerationGatewayModule,
    BrandValidationModule,
    BrandedGenerationReceiptsModule,
    BrandedTextGenerationModule,
    ByokModule,
    PrismaModule,
  ],
  providers: [
    BreakoutOutputQualityService,
    BreakoutMediaOutputGenerationService,
    BreakoutTextOutputGenerationService,
  ],
  exports: [
    BreakoutOutputQualityService,
    BreakoutMediaOutputGenerationService,
    BreakoutTextOutputGenerationService,
  ],
})
export class BreakoutGenerationModule {}
