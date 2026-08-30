import { SavedAdsController } from '@api/collections/saved-ads/controllers/saved-ads.controller';
import { SavedAdsService } from '@api/collections/saved-ads/services/saved-ads.service';
import { AdsResearchModule } from '@api/endpoints/ads-research/ads-research.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SavedAdsController],
  exports: [SavedAdsService],
  imports: [AdsResearchModule, FilesClientModule],
  providers: [SavedAdsService],
})
export class SavedAdsModule {}
