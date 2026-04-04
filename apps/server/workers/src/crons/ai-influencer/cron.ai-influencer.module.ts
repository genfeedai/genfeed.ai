import { AiInfluencerModule } from '@api/services/ai-influencer/ai-influencer.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronAiInfluencerService } from '@workers/crons/ai-influencer/cron.ai-influencer.service';

@Module({
  exports: [CronAiInfluencerService],
  imports: [forwardRef(() => AiInfluencerModule)],
  providers: [CronAiInfluencerService],
})
export class CronAiInfluencerModule {}
