import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContentEngineModule } from '@api/services/content-engine/content-engine.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronContentEngineService } from '@workers/crons/content-engine/cron.content-engine.service';

@Module({
  exports: [CronContentEngineService],
  imports: [
    forwardRef(() => BrandsModule),
    forwardRef(() => ContentEngineModule),
  ],
  providers: [CronContentEngineService],
})
export class CronContentEngineModule {}
