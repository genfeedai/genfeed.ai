import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { CreativePatternsModule } from '@api/collections/creative-patterns/creative-patterns.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { AdsResearchController } from '@api/endpoints/ads-research/ads-research.controller';
import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import { AdsGatewayModule } from '@api/services/ads-gateway/ads-gateway.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AdsResearchController],
  imports: [
    AdPerformanceModule,
    CreativePatternsModule,
    CredentialsModule,
    AdsGatewayModule,
    WorkflowsModule,
  ],
  providers: [AdsResearchService],
})
export class AdsResearchModule {}
