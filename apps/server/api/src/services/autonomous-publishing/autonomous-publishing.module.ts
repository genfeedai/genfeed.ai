import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [PrismaModule],
  providers: [AutonomousPublishPolicyService],
  exports: [AutonomousPublishPolicyService],
})
export class AutonomousPublishingModule {}
