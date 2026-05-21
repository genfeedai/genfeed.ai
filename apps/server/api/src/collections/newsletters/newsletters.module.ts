import { BrandsModule } from '@api/collections/brands/brands.module';
import { NewslettersController } from '@api/collections/newsletters/controllers/newsletters.controller';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [NewslettersController],
  exports: [NewslettersService],
  imports: [BrandsModule, LoggerModule, OpenRouterModule],
  providers: [NewslettersService],
})
export class NewslettersModule {}
