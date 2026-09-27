import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { DevController } from '@api/endpoints/dev/dev.controller';
import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { Module } from '@nestjs/common';

/**
 * Dev module for development-only endpoints
 *
 * This module is only registered in development mode.
 * For Discord bot testing, hit the local notifications service at port 3111.
 */
@Module({
  controllers: [DevController],
  imports: [ActivityRecordingModule, IngredientsModule],
})
export class DevModule {}
