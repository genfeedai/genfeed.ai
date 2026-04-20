import { CreditsModule } from '@api/collections/credits/credits.module';
import { StreaksController } from '@api/collections/streaks/controllers/streaks.controller';
import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [StreaksController],
  exports: [StreaksService],
  imports: [forwardRef(() => CreditsModule), NotificationsModule],
  providers: [StreaksService],
})
export class StreaksModule {}
