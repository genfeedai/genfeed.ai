import { ConfigModule } from '@api/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DesktopSyncController } from './desktop-sync.controller';
import { DesktopSyncService } from './desktop-sync.service';
import {
  DesktopMessage,
  DesktopMessageSchema,
} from './schemas/desktop-message.schema';
import {
  DesktopThread,
  DesktopThreadSchema,
} from './schemas/desktop-thread.schema';

@Module({
  controllers: [DesktopSyncController],
  imports: [
    ConfigModule,
    LoggerModule,
    MongooseModule.forFeature([
      { name: DesktopThread.name, schema: DesktopThreadSchema },
      { name: DesktopMessage.name, schema: DesktopMessageSchema },
    ]),
  ],
  providers: [DesktopSyncService],
})
export class DesktopSyncModule {}
