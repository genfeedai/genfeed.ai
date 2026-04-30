import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { ConfigModule } from '@api/config/config.module';
import { BatchGenerationController } from '@api/services/batch-generation/batch-generation.controller';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [BatchGenerationController],
  exports: [BatchGenerationService],
  imports: [
    forwardRef(() => BrandsModule),
    ConfigModule,
    forwardRef(() => ContentIntelligenceModule),
    HarnessProfilesModule,
    LoggerModule,
    forwardRef(() => PostsModule),
  ],
  providers: [BatchGenerationService],
})
export class BatchGenerationModule {}
