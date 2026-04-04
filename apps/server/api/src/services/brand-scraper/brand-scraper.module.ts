import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [BrandScraperService],
  providers: [BrandScraperService],
})
export class BrandScraperModule {}
