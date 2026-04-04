import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { ConfigModule } from '@api/config/config.module';
import { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [ContentQualityScorerService],
  imports: [
    ConfigModule,
    LoggerModule,
    OpenRouterModule,
    forwardRef(() => IngredientsModule),
    forwardRef(() => PostsModule),
  ],
  providers: [ContentQualityScorerService],
})
export class ContentQualityModule {}
