import { ConfigModule } from '@api/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { DesktopSyncController } from './desktop-sync.controller';
import { DesktopSyncService } from './desktop-sync.service';

@Module({
  controllers: [DesktopSyncController],
  imports: [ConfigModule, LoggerModule],
  providers: [DesktopSyncService],
})
export class DesktopSyncModule {}
