import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { CreativePatternsModule } from '@api/collections/creative-patterns/creative-patterns.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { AdsResearchController } from '@api/endpoints/ads-research/ads-research.controller';
import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import { AdsGatewayModule } from '@api/services/ads-gateway/ads-gateway.module';
import { PaidCreativeResearchModule } from '@api/services/paid-creative-research/paid-creative-research.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AdsResearchController],
  exports: [AdsResearchService],
  imports: [
    AdPerformanceModule,
    CreativePatternsModule,
    CredentialsCoreModule,
    AdsGatewayModule,
    PaidCreativeResearchModule,
    WorkflowsCoreModule,
  ],
  providers: [AdsResearchService],
})
export class AdsResearchModule {}
