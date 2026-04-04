import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { BrandScraperModule } from '@api/services/brand-scraper/brand-scraper.module';
import { LinkedInController } from '@api/services/integrations/linkedin/controllers/linkedin.controller';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(LinkedInService, {
  additionalImports: [
    HttpModule,
    BrandScraperModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsModule),
  ],
});

@Module({
  controllers: [LinkedInController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class LinkedInModule {}
