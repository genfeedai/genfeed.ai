import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DistributionsCoreModule } from '@api/collections/distributions/distributions-core.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { TelegramDistributionService } from '@server/services/distribution/telegram/telegram-distribution.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [TelegramDistributionService],
  imports: [
    ConfigModule,
    HttpModule,
    LoggerModule,
    CredentialsCoreModule,
    DistributionsCoreModule,
    QueuesModule,
  ],
  providers: [TelegramDistributionService],
})
export class TelegramDistributionModule {}
