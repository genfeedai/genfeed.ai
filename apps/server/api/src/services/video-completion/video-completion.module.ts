import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { VideoCompletionService } from '@api/services/video-completion/video-completion.service';
import { RedisModule } from '@libs/redis/redis.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [VideoCompletionService],
  imports: [RedisModule, IngredientsModule, MetadataModule],
  providers: [VideoCompletionService],
})
export class VideoCompletionModule {}
