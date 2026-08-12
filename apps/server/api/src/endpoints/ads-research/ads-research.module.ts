import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { CreativePatternsModule } from '@api/collections/creative-patterns/creative-patterns.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { AdsResearchController } from '@api/endpoints/ads-research/ads-research.controller';
import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import { AdsGatewayModule } from '@api/services/ads-gateway/ads-gateway.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [AdsResearchController],
  exports: [AdsResearchService],
  imports: [
    forwardRef(() => AdPerformanceModule),
    forwardRef(() => CreativePatternsModule),
    forwardRef(() => CredentialsCoreModule),
    forwardRef(() => AdsGatewayModule),
    forwardRef(() => WorkflowsModule),
  ],
  providers: [AdsResearchService],
})
export class AdsResearchModule {}
