import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DistributionsModule } from '@api/collections/distributions/distributions.module';
import { ConfigModule } from '@api/config/config.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { TelegramDistributionService } from '@api/services/distribution/telegram/telegram-distribution.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [TelegramDistributionService],
  imports: [
    ConfigModule,
    HttpModule,
    LoggerModule,
    CredentialsCoreModule,
    forwardRef(() => DistributionsModule),
    QueuesModule,
  ],
  providers: [TelegramDistributionService],
})
export class TelegramDistributionModule {}
