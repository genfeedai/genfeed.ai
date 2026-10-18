import { BrandPolicyJudgeService } from '@api/services/brand-publish-policy/brand-policy-judge.service';
import { BrandPublishPolicyService } from '@api/services/brand-publish-policy/brand-publish-policy.service';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/** The brand's active Policy and its judge (#7339), read by the single publish gate. */
@Module({
  exports: [BrandPublishPolicyService],
  imports: [LlmDispatcherModule, LoggerModule, PrismaModule],
  providers: [BrandPolicyJudgeService, BrandPublishPolicyService],
})
export class BrandPublishPolicyModule {}
