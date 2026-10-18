import { PublishApprovalsController } from '@api/collections/publish-approvals/controllers/publish-approvals.controller';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { AgentArtifactReferenceService, SERVER_TOKENS } from '@api/index';
import { BrandPublishPolicyModule } from '@api/services/brand-publish-policy/brand-publish-policy.module';
import { BrandPublishPolicyService } from '@api/services/brand-publish-policy/brand-publish-policy.service';
import { BrandedPublishHoldService } from '@api/services/branded-text-generation/branded-publish-hold.service';
import { MediaAssessmentModule } from '@api/services/media-assessment/media-assessment.module';
import { MediaAssessmentService } from '@api/services/media-assessment/media-assessment.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [PublishApprovalsController],
  exports: [PublishApprovalsService],
  imports: [BrandPublishPolicyModule, MediaAssessmentModule],
  providers: [
    AgentArtifactReferenceService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
    {
      inject: [
        PrismaService,
        AgentArtifactReferenceService,
        LoggerService,
        MediaAssessmentService,
        BrandPublishPolicyService,
      ],
      provide: PublishApprovalsService,
      useFactory: (
        prisma: PrismaService,
        artifactReferenceService: AgentArtifactReferenceService,
        logger: LoggerService,
        mediaGate: MediaAssessmentService,
        brandPublishPolicy: BrandPublishPolicyService,
      ) =>
        new PublishApprovalsService(
          prisma,
          artifactReferenceService,
          logger,
          mediaGate,
          new BrandedPublishHoldService(prisma, brandPublishPolicy),
        ),
    },
  ],
})
export class PublishApprovalsModule {}
