import { ContentLearningCoreModule } from '@api/collections/content-learning/content-learning-core.module';
import { ContentLearningController } from '@api/collections/content-learning/controllers/content-learning.controller';
import { ContentLearningAdminController } from '@api/collections/content-learning/controllers/content-learning-admin.controller';
import { LearningReadService } from '@api/collections/content-learning/services/learning-read.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [ContentLearningCoreModule, PrismaModule],
  controllers: [ContentLearningController, ContentLearningAdminController],
  providers: [LearningReadService],
})
export class ContentLearningModule {}
