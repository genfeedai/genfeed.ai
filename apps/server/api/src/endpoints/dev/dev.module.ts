import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { DevController } from '@api/endpoints/dev/dev.controller';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { Module } from '@nestjs/common';

/**
 * Dev module for development-only endpoints
 *
 * This module is only registered in development mode.
 * For Discord bot testing, hit the notifications service directly at port 3013.
 */
@Module({
  controllers: [DevController],
  imports: [NotificationsModule, IngredientsModule],
})
export class DevModule {}
