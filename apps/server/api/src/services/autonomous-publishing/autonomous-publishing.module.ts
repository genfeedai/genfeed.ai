import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { BrandPublishPolicyModule } from '@api/services/brand-publish-policy/brand-publish-policy.module';
import { MediaAssessmentModule } from '@api/services/media-assessment/media-assessment.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    ActivityRecordingModule,
    BrandPublishPolicyModule,
    MediaAssessmentModule,
    PrismaModule,
  ],
  providers: [AutonomousPublishPolicyService],
  exports: [AutonomousPublishPolicyService],
})
export class AutonomousPublishingModule {}
