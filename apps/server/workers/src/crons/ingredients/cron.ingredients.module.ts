import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronIngredientsService } from '@workers/crons/ingredients/cron.ingredients.service';

@Module({
  exports: [CronIngredientsService],
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => FilesClientModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
  ],
  providers: [CronIngredientsService],
})
export class CronIngredientsModule {}
