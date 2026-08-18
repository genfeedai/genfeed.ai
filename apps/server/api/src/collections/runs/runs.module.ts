/**
 * Runs Module
 * Unified execution tracking for human and agent initiated actions
 * across web, Telegram, CLI, extension, IDE, and API surfaces.
 */
import { RunsController } from '@api/collections/runs/controllers/runs.controller';
import { RunsService } from '@api/collections/runs/services/runs.service';
import { RunsMeteringService } from '@api/collections/runs/services/runs-metering.service';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [RunsController],
  exports: [RunsService],
  imports: [NotificationsPublisherModule],
  providers: [RunsService, RunsMeteringService],
})
export class RunsModule {}
