import { CredentialsModule } from '@api/collections/credentials/credentials.module';
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
    forwardRef(() => CredentialsModule),
    forwardRef(() => DistributionsModule),
    forwardRef(() => QueuesModule),
  ],
  providers: [TelegramDistributionService],
})
export class TelegramDistributionModule {}
