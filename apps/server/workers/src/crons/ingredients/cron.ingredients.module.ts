import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { forwardRef, Module } from '@nestjs/common';
import { CacheModule } from '@server/services/cache/cache.module';
import { CronIngredientsService } from '@workers/crons/ingredients/cron.ingredients.service';
import { FileServicesModule } from '@workers/services/file-services.module';

@Module({
  exports: [CronIngredientsService],
  imports: [
    forwardRef(() => ActivitiesModule),
    CacheModule,
    FileServicesModule,
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
  ],
  providers: [CronIngredientsService],
})
export class CronIngredientsModule {}
