import { BrandScraperService } from '@server/services/brand-scraper/brand-scraper.service';
import { BrandWebsiteParserService } from '@server/services/brand-scraper/brand-website-parser.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [BrandScraperService],
  providers: [BrandScraperService, BrandWebsiteParserService],
})
export class BrandScraperModule {}
