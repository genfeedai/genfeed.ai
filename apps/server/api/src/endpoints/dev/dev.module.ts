import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { DevController } from '@api/endpoints/dev/dev.controller';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { forwardRef, Module } from '@nestjs/common';

/**
 * Dev module for development-only endpoints
 *
 * This module is only registered in development mode.
 * For Discord bot testing, hit the local notifications service at port 3111.
 */
@Module({
  controllers: [DevController],
  imports: [
    forwardRef(() => NotificationsModule),
    forwardRef(() => IngredientsModule),
  ],
})
export class DevModule {}
