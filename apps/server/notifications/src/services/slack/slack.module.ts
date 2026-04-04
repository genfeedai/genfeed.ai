import { Module } from '@nestjs/common';
import { SlackService } from '@notifications/services/slack/slack.service';
import { SharedModule } from '@notifications/shared/shared.module';

@Module({
  exports: [SlackService],
  imports: [SharedModule],
  providers: [SlackService],
})
export class SlackNotificationModule {}
