import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { BrandWebsiteParserService } from '@api/services/brand-scraper/brand-website-parser.service';
import { PublicXBrandSourceService } from '@api/services/brand-scraper/public-x-brand-source.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [BrandScraperService],
  providers: [
    BrandScraperService,
    BrandWebsiteParserService,
    PublicXBrandSourceService,
  ],
})
export class BrandScraperModule {}
