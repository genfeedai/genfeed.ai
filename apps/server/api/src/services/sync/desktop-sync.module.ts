import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';
import { DesktopSyncController } from './desktop-sync.controller';
import { DesktopSyncService } from './desktop-sync.service';

@Module({
  controllers: [DesktopSyncController],
  imports: [ConfigModule, forwardRef(() => FilesClientModule), LoggerModule],
  providers: [DesktopSyncService],
})
export class DesktopSyncModule {}
