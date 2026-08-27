import { ModelsModule } from '@api/collections/models/models.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronModelDeprecationService } from '@workers/crons/model-deprecation/cron.model-deprecation.service';

@Module({
  imports: [forwardRef(() => ModelsModule)],
  providers: [CronModelDeprecationService],
})
export class CronModelDeprecationModule {}
