import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { SyncController } from '@api/services/sync/sync.controller';
import { SyncService } from '@api/services/sync/sync.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SyncController],
  exports: [SyncService],
  imports: [ConfigModule, LoggerModule, HttpModule, WorkflowsModule],
  providers: [SyncService],
})
export class SyncModule {}
