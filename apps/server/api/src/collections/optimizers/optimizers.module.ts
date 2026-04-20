/**
 * Optimizers Module
 * AI-powered content optimization: analyze quality, score content (0-100), suggest improvements,
 * generate hashtags, create A/B variants, and recommend best posting times.
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OptimizersController } from '@api/collections/optimizers/controllers/optimizers.controller';
import { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import { ConfigModule } from '@api/config/config.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [OptimizersController],
  exports: [OptimizersService],
  imports: [
    ByokModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    ReplicateModule,
  ],
  providers: [OptimizersService, CreditsGuard, CreditsInterceptor],
})
export class OptimizersModule {}
