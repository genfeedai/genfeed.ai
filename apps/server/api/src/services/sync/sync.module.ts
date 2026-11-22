import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { SyncController } from '@api/services/sync/sync.controller';
import { SyncService } from '@api/services/sync/sync.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SyncController],
  exports: [SyncService],
  imports: [
    ConfigModule,
    LoggerModule,
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    WorkflowsModule,
  ],
  providers: [SyncService],
})
export class SyncModule {}
