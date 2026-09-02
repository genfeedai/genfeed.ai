import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronIngredientsService } from '@workers/crons/ingredients/cron.ingredients.service';
import { FileServicesModule } from '@workers/services/file-services.module';

@Module({
  exports: [CronIngredientsService],
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    CacheModule,
    FileServicesModule,
  ],
  providers: [CronIngredientsService],
})
export class CronIngredientsModule {}
