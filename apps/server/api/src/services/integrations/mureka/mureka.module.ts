import { MurekaService } from '@api/services/integrations/mureka/services/mureka.service';
import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [MurekaService],
  imports: [ConfigModule, HttpModule, LoggerModule, PollUntilModule],
  providers: [MurekaService],
})
export class MurekaModule {}
