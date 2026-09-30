import { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import { LearningDatasetService } from '@api/collections/content-learning/services/learning-dataset.service';
import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { LearningOperationService } from '@api/collections/content-learning/services/learning-operation.service';
import { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
import { LearningReleaseService } from '@api/collections/content-learning/services/learning-release.service';
import { LearningRewardService } from '@api/collections/content-learning/services/learning-reward.service';
import { LearningRunService } from '@api/collections/content-learning/services/learning-run.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [PrismaModule],
  providers: [
    LearningAccountService,
    LearningDecisionService,
    LearningCheckpointService,
    LearningRewardService,
    LearningPolicyService,
    LearningDatasetService,
    LearningRunService,
    LearningReleaseService,
    LearningDependencyService,
    LearningOperationService,
  ],
  exports: [
    LearningAccountService,
    LearningDecisionService,
    LearningCheckpointService,
    LearningRewardService,
    LearningPolicyService,
    LearningDatasetService,
    LearningRunService,
    LearningReleaseService,
    LearningDependencyService,
    LearningOperationService,
  ],
})
export class ContentLearningCoreModule {}
