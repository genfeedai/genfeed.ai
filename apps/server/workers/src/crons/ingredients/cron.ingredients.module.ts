import { forwardRef, Module } from '@nestjs/common';
import { CacheModule } from '@server/services/cache/cache.module';
import { CronIngredientsService } from '@workers/crons/ingredients/cron.ingredients.service';
import { FileServicesModule } from '@workers/services/file-services.module';
import { WorkersDomainModule } from '@server/workers-domain.module';

@Module({
  exports: [CronIngredientsService],
  imports: [WorkersDomainModule, CacheModule, FileServicesModule],
  providers: [CronIngredientsService],
})
export class CronIngredientsModule {}
