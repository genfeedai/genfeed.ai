import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { MediaAssessmentModule } from '@api/services/media-assessment/media-assessment.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [MediaAssessmentModule, PrismaModule],
  providers: [AutonomousPublishPolicyService],
  exports: [AutonomousPublishPolicyService],
})
export class AutonomousPublishingModule {}
