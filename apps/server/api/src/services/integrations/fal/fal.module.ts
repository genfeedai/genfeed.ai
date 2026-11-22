import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { FalService } from '@api/services/integrations/fal/services/fal.service';
import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [FalService],
  imports: [
    ConfigModule,
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    LoggerModule,
    PollUntilModule,
  ],
  providers: [FalService],
})
export class FalModule {}
