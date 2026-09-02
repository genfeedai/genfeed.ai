import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [ContentQualityScorerService],
  imports: [
    ConfigModule,
    LoggerModule,
    OpenRouterModule,
    IngredientsModule,
    PostsCoreModule,
  ],
  providers: [ContentQualityScorerService],
})
export class ContentQualityModule {}
