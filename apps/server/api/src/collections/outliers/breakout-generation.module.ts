import { CreditsModule } from '@api/collections/credits/credits.module';
import { BreakoutMediaOutputGenerationService } from '@api/collections/outliers/services/breakout-media-output-generation.service';
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
    BreakoutMediaOutputGenerationService,
    BreakoutTextOutputGenerationService,
  ],
  exports: [
    BreakoutMediaOutputGenerationService,
    BreakoutTextOutputGenerationService,
  ],
})
export class BreakoutGenerationModule {}
