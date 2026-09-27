import { CreditsModule } from '@api/collections/credits/credits.module';
import { StreaksController } from '@api/collections/streaks/controllers/streaks.controller';
import { StreaksActivityListener } from '@api/collections/streaks/listeners/streaks-activity.listener';
import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [StreaksController],
  exports: [StreaksService],
  imports: [ActivityRecordingModule, CreditsModule],
  providers: [StreaksActivityListener, StreaksService],
})
export class StreaksModule {}
