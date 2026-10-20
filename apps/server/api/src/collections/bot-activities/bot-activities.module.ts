/**
 * Bot Activities Module
 * Logs every action taken by the reply bot system.
 * Tracks successful replies, DMs sent, and skipped/failed actions.
 */
import { BotActivitiesController } from '@api/collections/bot-activities/controllers/bot-activities.controller';
import { AssistedReplyQueueService } from '@api/collections/bot-activities/services/assisted-reply-queue.service';
import { BotActivitiesService } from '@api/collections/bot-activities/services/bot-activities.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BotActivitiesController],
  exports: [BotActivitiesService],
  providers: [AssistedReplyQueueService, BotActivitiesService],
})
export class BotActivitiesModule {}
