import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { FalService } from '@server/services/integrations/fal/services/fal.service';

@Module({
  exports: [FalService],
  imports: [ConfigModule, HttpModule, LoggerModule, PollUntilModule],
  providers: [FalService],
})
export class FalModule {}
