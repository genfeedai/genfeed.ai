import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { BatchGenerationController } from '@api/services/batch-generation/batch-generation.controller';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [BatchGenerationController],
  exports: [BatchGenerationService],
  imports: [
    forwardRef(() => BrandsModule),
    forwardRef(() => ConfigModule),
    forwardRef(() => ContentIntelligenceModule),
    forwardRef(() => HarnessProfilesModule),
    forwardRef(() => LoggerModule),
    forwardRef(() => PostsModule),
  ],
  providers: [BatchGenerationService],
})
export class BatchGenerationModule {}
